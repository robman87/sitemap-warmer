import fetch from 'node-fetch'
import Logger  from 'logplease'
import { parse } from 'node-html-parser'
import utils from './utilities.js'
import http from 'node:http'
import https from 'node:https'

const logger = Logger.create('warmer')

export default class Warmer {
    constructor(sitemap, settings) {
        const {
            warmup_brotli,
            warmup_gzip,
            warmup_deflate,
            warmup_avif,
            warmup_webp,
            custom_headers,
            cloudflare_email,
            cloudflare_zone_id,
            cloudflare_api_key
        } = settings

        const accept_encoding = {}
        if (warmup_brotli) {
            accept_encoding.br = 'gzip, deflate, br'
        }
        if (warmup_gzip) {
            accept_encoding.gzip = 'gzip, deflate'
        }
        if (warmup_deflate || !Object.keys(accept_encoding).length) {
            accept_encoding.deflate = 'deflate'
        }

        const accept_default = 'image/apng,image/svg+xml,image/*,*/*;q=0.8'
        const accept = {
            default: accept_default
        }
        if (warmup_avif) {
            accept.avif = `image/avif,image/webp,${accept_default}`
        }
        if (warmup_webp) {
            accept.webp = `image/webp,${accept_default}`
        }

        this.cloudflare_purge_enabled = settings.purge &&
            [cloudflare_email, cloudflare_zone_id, cloudflare_api_key]
                .every((value) =>
                    typeof value == 'string' && value.length
                )

        this.settings = settings
        this.accept_encoding = accept_encoding
        this.accept = accept
        this.custom_headers = custom_headers
        this.sitemap = sitemap
        this.url = sitemap.getURLs()
        this.images = sitemap.getImages()
        this.assets = new Set()
        this.user_agent = 'datuan.dev - Cache Warmer (https://github.com/tdtgit/sitemap-warmer)'
    }

    async warmup() {
        const urls =  Object.keys(this.url)
        if (!urls.length) {
            logger.info('📫 No URLs need to warm up. You might want to using parameter --range or --all. Using command `warmup -h` for more information.')
            return
        }

        if (this.settings.all) {
            logger.info('✅  Done. Prepare warming all URLs')
        }
        else {
            logger.info(`✅  Done. Prepare warming URLs newer than ${this.settings.newer_than}s (${utils.toHumans(this.settings.newer_than)})`)
        }

        logger.info(`🕸  Starting warming of ${urls.length} URLs...`)
        let count = 0
        for (const url of urls) {
            await this.warmup_site(url, ++count, urls.length)
        }

        const images = Object.values(this.images)
        if (images.length) {
            logger.info(`🕸  Starting warming of ${images.length} images...`)
            count = 0
            for (let image of images) {
                await this.warmup_image(image, ++count, images.length)
            }
        }

        this.assets = new Set(
            Array.from(this.assets.values())
                .map(utils.tryValidURL)
                .filter(url => !!url)
        )
        if (this.assets.size) {
            logger.info(`🕸  Starting warming of ${this.assets.size} assets...`)
            count = 0
            for (let url of this.assets) {
                await this.warmup_site(url, ++count, this.assets.size)
            }
        }

        logger.info(`📫 Done! Warm up total ${urls.length} URLs (included ${images.length} images) and ${this.assets.size} assets. Have fun!`)
    }

    async warmup_site(url, current = 0, total = 0) {
        logger.debug(`🚀  Processing ${url} ${current}/${total} (${(current / total * 100).toFixed(2)}%)`)

        const { purge, purge_all_encodings, purge_delay, delay } = this.settings

        if (
            this.cloudflare_purge_enabled ||
            (purge && !purge_all_encodings)
        ) {
            await this.purge(url)
            await utils.sleep(purge_delay)
        }
        for (const encoding_key of Object.keys(this.accept_encoding)) {
            const accept_encoding = this.accept_encoding[encoding_key]
            if (purge && purge_all_encodings && !this.cloudflare_purge_enabled) {
                await this.purge(url, accept_encoding)
                await utils.sleep(purge_delay)
            }
            await this.warmup_url(url, Object.assign({}, this.custom_headers, {accept_encoding}))
            await utils.sleep(delay)
        }
    }

    async warmup_image(image_url, current = 0, total = 0) {
        logger.debug(`🚀📷 Processing image ${image_url} ${current}/${total} (${(current / total * 100).toFixed(2)}%)`)
        const { purge_images, purge_delay, delay } = this.settings
        if (purge_images) {
            await this.purge(image_url)
            await utils.sleep(purge_delay)
        }
        for (const accept of Object.keys(this.accept)) {
            await this.warmup_url(image_url, Object.assign({}, this.custom_headers, {accept: this.accept[accept]}))
            await utils.sleep(delay)
        }
    }

    async purge_cloudflare(url) {
        logger.debug('  🗑️ Purging', {
            method: 'DELETE',
            url: url
        })

        if (!Array.isArray(url)) {
            url = [url]
        }

        const { cloudflare_email, cloudflare_zone_id, cloudflare_api_key } = this.settings

        return this.fetch(`https://api.cloudflare.com/client/v4/zones/${cloudflare_zone_id}/purge_cache`, {
            method: 'DELETE',
            headers: {
                'User-Agent': this.user_agent,
                'X-Auth-Email': cloudflare_email,
                'X-Auth-Key': cloudflare_api_key,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                files: url,
            }),
        })
    }

    async purge_proxy(url, accept_encoding = '') {
        const headers = Object.assign(
            this.custom_headers,
            { accept_encoding }
        )
        const method = this.settings.purge_url ? "GET" : "PURGE"

        const purge_url = this.settings.purge_url
            ? url.replace(this.settings.domain, this.settings.purge_url)
            : url

        logger.debug('  🗑️ Purging', {
            method,
            url: purge_url,
            accept_encoding: headers.accept_encoding
        })

        const options = {
            headers: Object.assign(
                {
                    "cache-control": "no-cache",
                    "pragma": "no-cache",
                    "user-agent": this.user_agent
                },
                headers
            ),
            body: null,
            method,
            mode: "cors"
        }

        return this.fetch(purge_url, options)
    }
    async purge(url, accept_encoding = '') {
        const res = await (
            this.cloudflare_purge_enabled
                ? this.purge_cloudflare(url)
                : this.purge_proxy(url, accept_encoding)
        )
        let response, icon
        switch (res.status) {
            case 200:
                icon = `❄`
                response = 'purged from cache'
                // Nginx specific
                const body = await res.text()
                if (body.includes('Successful purge')) {
                    const rows = body.split('\r\n')
                        .filter(row => row.includes('Key') || row.includes('Path'))
                    const key = (rows.find(row => row.includes('Key')) + '').split(':').pop().trim()
                    const path = (rows.find(row => row.includes('Path')) + '').split(':').pop().trim()
                    logger.debug('  🤖 Nginx successfully purged', { key, path })
                }
                break
            case 404:
                icon = `🐌️`
                response = 'was not in cache'
                break
            case 405:
                icon = `🚧`
                response = `${res.method} method not allowed`
                break
        }
        if (response) {
            logger.debug(`  ${icon} ${url} ${response} (${res.status})`)
        }
    }

    async warmup_url(url, headers = { accept: '', accept_encoding: '' }, retry = true) {
        logger.debug(`  🔥️ Warming ${url} (Accept Encoding: ${headers.accept_encoding})`)

        let res
        try {
            res = await this.fetch(
                url,
                {
                    headers: Object.assign(
                        {
                            "cache-control": "no-cache",
                            "pragma": "no-cache",
                            "user-agent": this.user_agent
                        },
                        headers
                    ),
                    body: null,
                    method: "GET",
                    mode: "cors"
                }
            )
        } catch (err) {
            if (retry) {
                logger.debug(`  Failed warming ${url}! Retrying...`)
                return this.warmup_url(url, headers, false)
            }
            logger.info(`  Warming ${url} failed, skipping...`)
            return
        }

        const { cache_status_header, warmup_css, warmup_js } = this.settings

        // Check for headers used by Nginx proxy/FastCGI caches
        this.log_response_cache_status(url, headers.accept_encoding, res, cache_status_header)
        // Check for Cloudflare cache headers
        this.log_response_cache_status(url, headers.accept_encoding, res, 'Cf-Cache-Status', 'Cloudflare cache')

        // No need warmup CSS/JS
        if (warmup_css || warmup_js) {
            // Send HTML response for parsing CSS/JS
            this.html(await res.text())
        }
    }

    log_response_cache_status(url, accept_encoding, res, cache_status_header, cache_type = 'Cache') {
        const cacheStatus = (
            cache_status_header
                ? (res.headers.get(cache_status_header) || '')
                : ''
        ).toUpperCase()

        if (cacheStatus) {
            let result, icon
            switch (cacheStatus) {
                case 'MISS':
                    icon = `⚡️ `
                    result = 'warmed'
                    break;
                case 'HIT':
                    icon = `🔥`
                    result = 'was already warm'
                    break;
                case 'BYPASS': // nginx/varnish
                case 'DYNAMIC': // cloudflare
                    icon = `🚧`
                    result = 'bypassed'
                    break;
            }
            logger.debug(`  ${icon} Cache ${result} for ${url} (${cache_type} ${cacheStatus} => Accept-Encoding: ${accept_encoding})`)
            return cacheStatus
        }
        return false
    }

    async fetch(url, options) {
        if (this.settings.ip) {
            const { host } = new URL(url)
            options.headers.host = host

            const httpMod = this.settings.sitemap.protocol === 'https:' ? https : http
            options.agent = () => new httpMod.Agent({ servername: host })
            url = url.replace(host, this.settings.ip)

            logger.debug(`  ${options.method.toUpperCase()} ${url} with host ${host}`)
        }

        return fetch(url, options)
    }

    html(html) {
        const root = parse(html)

        const { domain, warmup_js, warmup_css } = this.settings

        if (warmup_js) {
            const scripts = root.querySelectorAll('script[src]')
            scripts.forEach(elem => {
                const { src } = elem.attributes
                if (utils.hasSameDomain(src, domain)) {
                    this.assets.add(src)
                }

            })
        }

        if (warmup_css) {
            const styles = root.querySelectorAll('link[href][rel="stylesheet"]')
            styles.forEach(elem => {
                const { href } = elem.attributes
                if (utils.hasSameDomain(href, domain)) {
                    this.assets.add(href)
                }
            })
        }
    }
}