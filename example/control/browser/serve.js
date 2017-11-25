const assert = require('reassert');
const assert_internal = assert;
const log = require('reassert/log');
const webpackConfig = require('./webpack.config');
const serve = require('@rebuild/serve');

const Repage = require('@repage/core/build');
const RepageRouterCrossroads = require('@repage/router-crossroads');
const RepageRenderer = require('@repage/renderer');
const RepageRendererReact = require('@repage/renderer-react');

const isCli = require.main === module;
if( isCli ) {
    serveBrowserAssets();
} else {
    module.exports = {serveBrowserAssets};
}


function serveBrowserAssets(opts) {
    serve(webpackConfig, {
        log: true,
        doNotCreateServer: true,
        doNotGenerateIndexHtml: true,
        ...opts,
        onBuild: async args => {
            if( ! opts.onBuild ) {
                return;
            }
            const ret = await buildHandler(args);
            opts.onBuild(ret);
        },
    });
}

async function buildHandler(args) {
    const {output, htmlBuilder, genericHtml} = args;
    assert_internal(output);
    assert_internal(htmlBuilder);
    assert_internal(genericHtml);

    const pages = getPages(output);

    await writeHtmlStaticPages({htmlBuilder, genericHtml, pages});

    return {pages, genericHtml, ...args};
}

async function writeHtmlStaticPages({pages, htmlBuilder}) {
    const repage = new Repage();

    repage.addPlugins([
        RepageRouterCrossroads(),
        RepageRenderer(),
        RepageRendererReact(),
    ]);

    repage.addPages(pages);

    const htmlStaticPages = await repage.getHtmlStaticPages();

    if( repage.indexHtmlIsMissing() ) {
        htmlBuilder({pathname: '/', html: genericHtml});
    }

    htmlStaticPages.forEach(({url, html}) => {
        assert_internal(url.pathname.startsWith('/'));
        assert_internal(url.search==='');
        assert_internal(url.hash==='');
        htmlBuilder({pathname: url.pathname, html});
    });
}

function getPages(output) {
    assert_internal(output.entry_points.pages.all_assets.length===1, output);
    const pagesEntry = output.entry_points.pages.all_assets[0];
    const {filepath: pagesPath} = pagesEntry;
    assert_internal(pagesPath, output);
    assert_internal(pagesEntry.source_entry_points.length===1, output);
    assert_internal(pagesEntry.source_entry_points[0]===require.resolve('../pages'), output);

  //let pages = require('../pages');
    let pages = require(pagesPath);

    const scripts = output.entry_points['main'].scripts;
    const styles = output.entry_points['main'].styles;
    pages = pages.map(page => ({
        scripts: page.renderToDom===null ? undefined : scripts,
        styles,
        ...page
    }));

    return pages;
}