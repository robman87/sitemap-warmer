import { isIP } from 'node:net'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

export default function parseCliParams() {
 return yargs(hideBin(process.argv))
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
        type: 'string',
        coerce: toBoolean,
        default: true
    })

    .option('css', {
        describe: 'Enable CSS warm up.',
        type: 'string',
        coerce: toBoolean,
        default: true
    })
    .option('js', {
        describe: 'Enable Javascript warm up.',
        type: 'string',
        coerce: toBoolean,
        default: true
    })

    .option('webp', {
        describe: 'Enable WebP images warm up.',
        type: 'string',
        coerce: toBoolean,
        default: true
    })
    .option('avif', {
        describe: 'Enable AVIF images warm up.',
        type: 'string',
        coerce: toBoolean,
        default: true
    })

    .option('brotli', {
        describe: 'Enable Brotli compress warm up (Used by all modern browsers, "Accept Encoding: gzip, deflate, br")',
        type: 'string',
        coerce: toBoolean,
        default: true
    })

    .option('gzip', {
        describe: 'Enable Gzip compress warm up (For old browsers or non-browser tools, "Accept Encoding: gzip, deflate")',
        type: 'string',
        coerce: toBoolean,
        default: true
    })

    .option('deflate', {
        describe: 'Enable Deflate compress warm up (For old browsers or non-browser tools, "Accept Encoding: deflate")',
        type: 'string',
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
        type: 'string',
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

     // Cloudflare
    .option('cf_email', {
        alias: 'cloudflare_email',
        describe: 'Cloudflare account email to purge Cloudflare proxy-cache.',
        type: 'string',
        default: ''
    })

    .option('cf_zone', {
         alias: 'cloudflare_zone_id',
         describe: 'Cloudflare zone id to purge Cloudflare proxy-cache.',
         type: 'string',
         default: ''
    })

    .option('cf_apikey', {
         alias: 'cloudflare_api_key',
         describe: 'Cloudflare API key to purge Cloudflare proxy-cache.',
         type: 'string',
         default: ''
    })

    .example('$0 domain.com --headers.authorization "Bearer secret_token"', 'Add custom auth header')

    .argv
}

function toBoolean(value) {
    return ['1', 'true'].includes(`${value}`) // empty string
}

function toInt(value) {
    return parseInt(value) || 0
}

function toIP(value) {
    return isIP(value) ? value : ''
}