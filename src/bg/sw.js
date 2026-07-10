/* global importScripts */

// Chrome MV3 service worker entry point. Firefox does not support extension
// service workers, so its manifest loads the same dependencies + js/core.js via
// `background.scripts` instead (see build_firefox_extension.py). The backend
// logic itself lives in js/core.js so both platforms share one implementation.

importScripts(
    'js/utils.js',
    'js/deinflector.js',
    'js/builtin.js',
    'js/ankiconnect.js',
    '../dict/builtin_encn_WordnetKaikki.js',
    'js/core.js'
);
