#!/usr/bin/env node
import SitemapXMLParser from 'datuan-sitemap-parser'
import Sitemap from './sitemap.js'
import Warmer from './warmer.js'
import utils from './utilities.js'
import fetch from 'node-fetch'
import Logger from 'logplease'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { isIP } from 'node:net'

const argv = yargs(hideBin(process.argv))
    .usage('Usage: $0' + ' domain.com')

    .alias('v', 'version')
    .alias('h', 'help')

    .option('a', {
        alias: 'all',
        describe: 'Warm up all all URLs in sitemap, ignores --range parameter',
        type: 'boolean',
        coerce: toBoolean,
        default: false
    })
    .option('r', {
        alias: 'range',
        describe: 'Only warm up URLs with lastModified newer than this value (in seconds). Default: 300s (5 minutes)',
        type: 'number',
        coerce: toInt,
        default: 300
    })
    .option('d', {
        alias: 'delay',
        describe: 'Delay (in milliseconds) between each warm up call. If your using low-end hosting, keep this value higher.',
        type: 'number',
        coerce: toInt,
        default: 500
    })
    .option('q', {
        alias: ['quiet', 'quite', 'silent'],
        describe: 'Disable debug logging if you feel it\'s too much.',
        type: 'boolean',
        coerce: toBoolean,
        default: false
    })

    .option('img', {
        alias: 'images',
        describe: 'Enable images warm up.',
        type: 'boolean',
        coerce: toBoolean,
        default: true
    })

    .option('css', {
        describe: 'Enable CSS warm up.',
        type: 'boolean',
        coerce: toBoolean,
        default: true
    })
    .option('js', {
        describe: 'Enable Javascript warm up.',
        type: 'boolean',
        coerce: toBoolean,
        default: true
    })

    .option('webp', {
        describe: 'Enable WebP images warm up.',
        type: 'boolean',
        coerce: toBoolean,
        default: true
    })
    .option('avif', {
        describe: 'Enable AVIF images warm up.',
        type: 'boolean',
        coerce: toBoolean,
        default: true
    })

    .option('brotli', {
        describe: 'Enable Brotli compress warm up (Used by all modern browsers, "Accept Encoding: gzip, deflate, br")',
        type: 'boolean',
        coerce: toBoolean,
        default: true
    })

    .option('gzip', {
        describe: 'Enable Gzip compress warm up (For old browsers or non-browser tools, "Accept Encoding: gzip, deflate")',
        type: 'boolean',
        coerce: toBoolean,
        default: true
    })

    .option('deflate', {
        describe: 'Enable Deflate compress warm up (For old browsers or non-browser tools, "Accept Encoding: deflate")',
        type: 'boolean',
        coerce: toBoolean,
        default: true
    })

    .option('p', {
        alias: 'purge',
        describe: 'Enable purging the resources before warm up (0 = no purging, 1 >= page content, 2 >= images).',
        type: 'number',
        coerce: toInt,
        default: 0,
        choices: [0, 1, 2]
    })

    .option('pd', {
        alias: 'purge_delay',
        describe: 'Delay (in milliseconds) after purging the resources before warm up.',
        type: 'number',
        coerce: toInt,
        default: 100
    })

    .option('pp', {
        alias: 'purge_path',
        describe: 'Path used for purging resources using GET method instead of PURGE. Use when PURGE method is not available or preferred, e.g. https://domain.com/purge/path_to_purge',
        type: 'string',
        default: ''
    })

    .option('pae', {
        alias: 'purge_all_encodings',
        describe: 'Use with Nginx proxy cache, not needed for Nginx Fast-CGI cache or Varnish. Nginx proxy cache keeps one copy of response for each unique "Accept Encoding" header value.',
        type: 'boolean',
        coerce: toBoolean,
        default: false
    })

    .option('headers', {
        default: {},
        describe: 'Add custom headers with warmup request. For instance Host, Authorization, User-Agent etc.',
    })

    .option('cache_status_header', {
        describe: 'Header for cache status, can be used with Nginx to detect and log cache HIT, MISS, BYPASS etc.',
        type: 'string',
        default: 'x-cache-status'
    })

    .option('ip', {
        describe: 'IP to call with Host header so SNI will work and correct SSL/TLS cert will be used.',
        type: 'string',
        coerce: toIP,
        default: ''
    })

    .example('$0 domain.com --headers.authorization "Bearer secret_token"', 'Add custom auth header')

    .argv

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

function toBoolean(value) {
    return ['1', 'true'].includes(`${value}`)
}

function toInt(value) {
    return parseInt(value) || 0
}

function toIP(value) {
    return isIP(value) ? value : ''
}