const assert_internal = require('reassert/internal');

const getProjectConfig = require('@reframe/utils/getProjectConfig');

const Repage = require('@repage/core');
const {getStaticPages} = require('@repage/build');


module.exports = getPageHTMLs;


async function getPageHTMLs(pageModules) {
    const projectConfig = getProjectConfig();

    const pageConfigs = pageModules.map(({pageExport}) => pageExport);

    return (
        (await get_static_pages_info())
        .map(({url, html}) => {
            assert_input({url, html});
            return {pathname: url.pathname, html};
        })
    );

    function get_static_pages_info() {
        const repage = new Repage();

        repage.addPlugins([
            ...projectConfig.repage_plugins,
        ]);

        repage.addPages(pageConfigs);

        return getStaticPages(repage);
    }

    function assert_input({url, html}) {
        assert_internal(html===null || html && html.constructor===String, html);
        assert_internal(html);

        assert_internal(url.pathname.startsWith('/'));
        assert_internal(url.search==='');
        assert_internal(url.hash==='');
    }
}
