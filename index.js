#!/usr/bin/env node
import SitemapXMLParser from 'datuan-sitemap-parser'
import fetch from 'node-fetch'
import Logger from 'logplease'

import Sitemap from './sitemap.js'
import Warmer from './warmer.js'
import utils from './utilities.js'
import parseCliParams from './args.js'

const argv = parseCliParams()

const logger = Logger.create('main', {
    useLocalTime: true,
})

if (argv.quiet) {
    Logger.setLogLevel(Logger.LogLevels.INFO)
}

const settings = {
    all: argv.all,
    sitemap: process.argv[2],
    domain: null,
    newer_than: argv.range,
    delay: argv.delay,
    warmup_images: argv.images,
    warmup_css: argv.css,
    warmup_js: argv.js,
    warmup_brotli: argv.brotli,
    warmup_gzip: argv.gzip,
    warmup_deflate: argv.deflate,
    warmup_webp: argv.webp,
    warmup_avif: argv.avif,
    purge: argv.purge >= 1,
    purge_images: argv.purge >= 2,
    purge_delay: argv.purge_delay,
    purge_path: argv.purge_path,
    purge_all_encodings: argv.purge_all_encodings,
    custom_headers: argv.headers,
    cache_status_header: argv.cache_status_header,
    ip: argv.ip
}

settings.sitemap = utils.tryValidURL(settings.sitemap)

if (!settings.sitemap) {
    logger.error(`Please specific an valid URL! Your URL ${settings.sitemap} seems not correct.`)
    process.exit()
}

settings.sitemap = new URL(settings.sitemap)
if (settings.sitemap.pathname === '/') {
    settings.sitemap = new URL('/sitemap.xml', settings.sitemap.href)
}

settings.domain = `${settings.sitemap.protocol}//${settings.sitemap.hostname}`

if (typeof settings.purge_path === 'string' && settings.purge_path.trim() !== '') {
    settings.purge_url = `${settings.domain}/${settings.purge_path}`
    settings.purge_url = utils.tryValidURL(settings.purge_url)
}

// Pre-check for issue: https://github.com/tdtgit/sitemap-warmer/issues/4
fetch(settings.sitemap.href, { method: 'HEAD' }).then((res) => {
    if (!res.ok) {
        throw new Error(res.statusText)
    }
}).then(() => {
    logger.info(`📬 Getting sitemap from ${settings.sitemap.href}`)

    const sitemapXMLParser = new SitemapXMLParser(settings.sitemap.href, {delay: 3000})
    return sitemapXMLParser.fetch()
}).then(urls => {
    const sitemap = new Sitemap(settings)
    urls.forEach(url => {
        sitemap.addURL(url)
    })

    const warmer = new Warmer(sitemap, settings)
    return warmer.warmup()
}).catch(error => {
    logger.error(error)
})