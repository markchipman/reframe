const assert_internal = require('reassert/internal');
const assert_usage = require('reassert/usage');
const {IsoBuilder} = require('@rebuild/iso');
const {Logger} = require('@rebuild/build/utils/Logger');
const reloadBrowser = require('@rebuild/serve/utils/autoreload/reloadBrowser');
const autoreloadClientPath = require.resolve('@rebuild/serve/utils/autoreload/client');
const pathModule = require('path');
const getUserDir = require('@brillout/get-user-dir');
const getDefaultBrowserConfig = require('./getDefaultBrowserConfig');
const getDefaultNodejsConfig = require('./getDefaultNodejsConfig');
const webpackConfigMod = require('@brillout/webpack-config-mod');
const {colorError} = require('@brillout/cli-theme');
const handleOutputDir = require('./handleOutputDir');
const FileSets = require('@brillout/file-sets');

const SOURCE_CODE_OUTPUT = 'source-code';
const BROWSER_OUTPUT = 'browser';
const NODEJS_OUTPUT = 'nodejs';

const AUTORELOAD_ENTRY_NAME = 'autoreload-client';


module.exports = WebpackSSR;


function WebpackSSR(opts) {
    const instance = {};
    Object.assign(instance, opts);
    const build = BuildInstance.call(instance);
    return () => build();
}

function BuildInstance() {
    const isoBuilder = new IsoBuilder();

    isoBuilder.logger = Logger({
        log_config_and_stats: (this.log||{}).verbose,
        getBuildStartText: () => 'Building pages',
        getBuildEndText: () => 'Pages built',
    });
    isoBuilder.doNotWatchBuildFiles = this.doNotWatchBuildFiles;

    const {outputDir} = this;
    assert_usage(outputDir);
    isoBuilder.outputDir = outputDir;
    handleOutputDir({outputDir});
    const fileSets = new FileSets({pathBase: outputDir});

    const autoReloadEnabled = process.env.NODE_ENV !== 'production' && ! this.doNotWatchBuildFiles;

    const that = this;

    isoBuilder.builder = (function* ({buildForNodejs, buildForBrowser}) {
        const pageFiles__by_interface = that.getPageFiles();

        const configNodejs = getNodejsConfig.call(that, {pageFiles__by_interface});
        const nodejsEntryPoints = yield buildForNodejs(configNodejs);
        assert_internal(Object.keys(nodejsEntryPoints).length>0, nodejsEntryPoints);

        const pageFiles = getPageFiles.call(that, {configNodejs, pageFiles__by_interface});
        assert_internal(Object.keys(pageFiles).length>0);

        that.pageModules = loadPageModules.call(that, {nodejsEntryPoints, pageFiles});

        that.pageBrowserEntries = getPageBrowserEntries.call(that);

        const configBrowser = getBrowserConfig.call(that, {fileSets, autoReloadEnabled});
        const browserEntryPoints = yield buildForBrowser(configBrowser);
        assert_internal(Object.values(browserEntryPoints).length>0, browserEntryPoints);

        writeAssetMap.call(that, {browserEntryPoints, fileSets, autoReloadEnabled, pageFiles});

        yield writeHtmlFiles.call(that, {fileSets});

        if( autoReloadEnabled ) {
            reloadBrowser();
        }
    }).bind(this);

    return () => isoBuilder.build();
}

function getNodejsConfig({pageFiles__by_interface}) {
    const nodejsEntries = getNodejsEntries.call(this, {pageFiles__by_interface});
    const nodejsOutputPath = pathModule.resolve(this.outputDir, NODEJS_OUTPUT);
    const defaultNodejsConfig = getDefaultNodejsConfig({entries: nodejsEntries, outputPath: nodejsOutputPath, filename: '[name]-nodejs.js'});
    const configNodejs = this.getWebpackNodejsConfig({config: defaultNodejsConfig, entries: nodejsEntries, outputPath: nodejsOutputPath, ...webpackConfigMod});
    assert_config({config: configNodejs, webpackEntries: nodejsEntries, outputPath: nodejsOutputPath, getterName: 'getWebpackNodejsConfig'});
    addContext(configNodejs);
    return configNodejs;
}

function getBrowserConfig({fileSets, autoReloadEnabled}) {
    const generatedEntries = generateBrowserEntries.call(this, {fileSets});
    const browserEntries = getBrowserEntries({generatedEntries, autoReloadEnabled});
    const browserOutputPath = pathModule.resolve(this.outputDir, BROWSER_OUTPUT);
    const defaultBrowserConfig = getDefaultBrowserConfig({entries: browserEntries, outputPath: browserOutputPath});
    assert_internal(Object.keys(browserEntries).length>0);
    const configBrowser = this.getWebpackBrowserConfig({config: defaultBrowserConfig, entries: browserEntries, outputPath: browserOutputPath, ...webpackConfigMod});
    assert_config({config: configBrowser, webpackEntries: browserEntries, outputPath: browserOutputPath, getterName: 'getWebpackBrowserConfig'});
    addContext(configBrowser);
    return configBrowser;
}

function getPageBrowserEntries() {
    const {pageModules} = this;
    assert_internal(pageModules.length>0);
    const pageBrowserEntries__array = this.getPageBrowserEntries(pageModules);
    const pageBrowserEntries = {};
    pageBrowserEntries__array.forEach(pageBrowserEntry => {
        const {pageName, browserEntryString, browserEntryOnlyCss} = pageBrowserEntry;
        assert_usage(pageName);
        assert_usage(browserEntryString);
        pageBrowserEntries[pageName] = {
            pageName,
            browserEntryString,
            browserEntryOnlyCss: !!browserEntryOnlyCss,
        };
    });
    return pageBrowserEntries;
}

function getNodejsEntries({pageFiles__by_interface}) {
    const {serverEntryFile} = this;

    const server_entries = {};

    Object.entries(pageFiles__by_interface)
    .forEach(([pageName, pageFile]) => {
        assert_internal(!server_entries[pageName]);
        server_entries[pageName] = [pageFile];
    });

    if( serverEntryFile ) {
        assert_usage(pathModule.isAbsolute(serverEntryFile));
        assert_usage(!server_entries.server);
        server_entries.server = [serverEntryFile];
    }

    return server_entries;
}

function getPageFiles({configNodejs, pageFiles__by_interface}) {
    const nodejsEntries = webpackConfigMod.getEntries(configNodejs);
    const nodejsEntryNames = Object.keys(nodejsEntries);
    assert_internal(nodejsEntryNames.length>0);

    Object.entries(pageFiles__by_interface)
    .forEach(([pageName, pageFile]) => {
        const entryPoint = nodejsEntries[pageName];
        assert_usage(
            entryPoint,
            nodejsEntryNames,
            pageName
        );
        assert_usage(
            entryPoint===pageFile || entryPoint.includes && entryPoint.includes(pageFile),
            entryPoint,
            pageFile,
            pageName
        );
    });

    const pageFiles__by_config = {};
    Object.entries(nodejsEntries)
    .filter(([pageName]) => !pageFiles__by_interface[pageName])
    .forEach(([pageName, entryFiles]) => {
        assert_internal(entryFiles.constructor===Array);
        assert_usage(
            entryFiles.length===1,
            entryFiles,
            "Cannot determine which one of the entry files printed above is the page file of `"+pageName+"`"
        );
        const entryFile = entryFiles[0];
        assert_usage(pathModule.isAbsolute(entryFile), entryFile);
        pageFiles__by_config[pageName] = entryFile;
    });

    const pageFiles = {
        ...pageFiles__by_interface,
        ...pageFiles__by_config,
    };

    return pageFiles;
}

function addContext(webpackConfig) {
    webpackConfig.context = webpackConfig.context || getUserDir();
    assert_internal(webpackConfig.context);
}

function assert_config({config, webpackEntries, outputPath, getterName}) {
    assert_internal(webpackEntries.constructor===Object);

    assert_usage(
        config,
        "`"+getterName+"` should return a webpack config but returns `"+config+"` instead."
    );

    const configEntries = Object.keys(webpackConfigMod.getEntries(config));
    assert_internal(configEntries.length>=0, configEntries);
    assert_usage(
        configEntries.length>0 || Object.keys(webpackEntries).length>0,
        colorError("No pages found."),
        "Do your page config file names end with `.config.js`?"
    );
    assert_usage(
        configEntries.length>0,
        config
    );

    Object.entries(webpackEntries)
    .forEach(([pageName]) => {
        assert_usage(
            configEntries.includes(pageName) || pageName===AUTORELOAD_ENTRY_NAME,
            "The config returned by `"+getterName+"` is missing the `"+pageName+"` entry: `config.entry['"+pageName+"']=="+config.entry[pageName]+"`.",
            {
                IS_REASSERT_OPTS: true,
                details: [
                    "`webpackEntries`: ",
                    webpackEntries,
                    "",
                    "`configEntries`: ",
                    configEntries,
                    "",
                    "`config.entry`: ",
                    config.entry,
                ],
            }
        );
    });
    assert_usage(
        config.output,
        config,
        "The config returned by `"+getterName+"` has its `output` set to `"+config.output+"` but we expect `output.path` to be `"+outputPath+"`.",
        "The config is printed above."
    );
    assert_usage(
        config.output && config.output.path===outputPath,
        config,
        "The config returned by `"+getterName+"` has its `output.path` set to `"+(config.output && config.output.path)+"` but it should be `"+outputPath+"` instead.",
        "The config is printed above."
    );
}

function loadPageModules({nodejsEntryPoints, pageFiles}) {
    const epS = Object.entries(nodejsEntryPoints);
    assert_internal(epS.length === Object.keys(pageFiles).length);
    const pageModules = (
        epS
        .map(([pageName, entry_point]) => {
            const {loadedModule, loadedModulePath} = entry_point;
            const pageFile = pageFiles[pageName];
            assert_internal(pageName);
            assert_internal(pageFile);
            assert_internal(loadedModulePath);
            return {
                pageName,
                pageExport: loadedModule,
                pageFile,
                pageFileTranspiled: loadedModulePath,
            };
        })
    );
    return pageModules;
}
function get_script_dist_path(entry_point) {
    let script_dist_path;
    entry_point.all_assets.forEach(({asset_type, filepath}) => {
        if( asset_type==='script' ) {
            assert_internal(!script_dist_path, entry_point);
            script_dist_path = filepath;
        }
    });
    assert_internal(script_dist_path, entry_point);
    return script_dist_path;
}

function getBrowserEntries({generatedEntries, autoReloadEnabled}) {
    const browserEntries = {...generatedEntries};

    if( autoReloadEnabled ) {
        assert_usage(!browserEntries[AUTORELOAD_ENTRY_NAME]);
        browserEntries[AUTORELOAD_ENTRY_NAME] = [autoreloadClientPath];
    }

    return browserEntries;
}
function generateBrowserEntries({fileSets}) {
    const {pageBrowserEntries} = this;

    const generatedEntries = {};

    fileSets.startFileSet('BROWSER_SOURCE_CODE');

    Object.values(pageBrowserEntries)
    .forEach(pageBrowserEntry => {
        assert_usage(pageBrowserEntry);
        const {browserEntryString, pageName} = pageBrowserEntry;

        assert_usage(browserEntryString && browserEntryString.constructor===String);

        const fileAbsolutePath = fileSets.writeFile({
            fileContent: browserEntryString,
            filePath: pathModule.join(SOURCE_CODE_OUTPUT, 'browser-entries', pageName+'-browser.js'),
        });
        assert_internal(fileAbsolutePath);

        assert_internal(!generatedEntries[pageName]);
        generatedEntries[pageName] = fileAbsolutePath;
    });

    fileSets.endFileSet();

    return generatedEntries;
}

async function writeHtmlFiles({fileSets}) {
    const {pageModules} = this;
    assert_internal(pageModules);

    const htmlStrings = await this.getPageHtmls();
    assert_usage(htmlStrings && htmlStrings.constructor===Array);

    fileSets.startFileSet('html_files');

    htmlStrings
    .forEach(({pathname, html}) => {
        assert_input({pathname, html});
        fileSets.writeFile({
            fileContent: html,
            filePath: get_file_path(pathname),
        });
    });

    fileSets.endFileSet();

    return;

    function get_file_path(pathname) {
        assert_internal(pathname.startsWith('/'));
        const filePath__relative = (pathname === '/' ? 'index' : pathname.slice(1))+'.html'
        const filePath = pathModule.join(BROWSER_OUTPUT, filePath__relative)
        return filePath;
    }

    function assert_input({pathname, html}) {
        assert_usage(html && html.constructor===String, html);

        assert_usage(pathname);
        assert_usage(pathname.startsWith('/'));
    }
}

function writeAssetMap({browserEntryPoints, fileSets, autoReloadEnabled, pageFiles}) {
    const {pageBrowserEntries, pageModules} = this;
    assert_internal(Object.keys(pageBrowserEntries).length>0);
    const pageNames = Object.keys(pageFiles);
    assert_internal(pageNames.length===pageModules.length);

    const {outputDir} = this;

    let buildTime = new Date();
    let buildEnv = process.env.NODE_ENV || 'development';
    let staticAssetsDir = pathModule.resolve(outputDir, BROWSER_OUTPUT);
    staticAssetsDir = makeBuildPathRelative(staticAssetsDir, {outputDir});
    const assetInfos = {
        buildTime,
        buildEnv,
        staticAssetsDir,
        pageAssets: {},
    };

    addPageFileTranspiled({assetInfos, pageModules, outputDir});

    add_browser_entry_points({assetInfos, pageBrowserEntries, browserEntryPoints});

    if( autoReloadEnabled ) {
        add_autoreload_client({assetInfos, pageNames, browserEntryPoints});
    }

    assert_assertMap(assetInfos);

    assert_internal(
        Object.keys(assetInfos.pageAssets).length>0,
        assetInfos
    );

    fileSets.writeFile({
        fileContent: JSON.stringify(assetInfos, null, 2),
        filePath: 'assetInfos.json',
        noFileSet: true,
    });
}
function addPageFileTranspiled({assetInfos, pageModules, outputDir}) {
    pageModules
    .forEach(({pageName, pageFileTranspiled, pageFile}) => {
        assert_internal(!assetInfos.pageAssets[pageName]);
        pageFileTranspiled = makeBuildPathRelative(pageFileTranspiled, {outputDir});
        pageFile = makeBuildPathRelative(pageFile, {outputDir});
        assetInfos
        .pageAssets[pageName] = {
            pageFileTranspiled,
            pageFile,
        };
    });
}
function makeBuildPathRelative(pathAbsolute, {outputDir}) {
    assert_internal(pathModule.isAbsolute(pathAbsolute));
    assert_internal(outputDir);
    return pathModule.relative(outputDir, pathAbsolute);
}
function assert_assertMap(assetInfos) {
    Object.entries(assetInfos.pageAssets)
    .forEach(([pageName, pageAssets]) => {
        assert_internal(pageName && pageName!=='undefined');
        [
            ...(pageAssets.scripts||[]),
            ...(pageAssets.styles||[])
        ]
        .forEach(pathname => {
            assert_internal(pathname && pathname.constructor===String && pathname.startsWith('/'), assetInfos);
        });
    });
}
function add_autoreload_client({assetInfos, pageNames, browserEntryPoints}) {
    const entry_point__autoreload = Object.values(browserEntryPoints).find(({entry_name}) => entry_name===AUTORELOAD_ENTRY_NAME);
    if( ! entry_point__autoreload ) {
        return;
    }
    pageNames
    .forEach(pageName => {
        assert_internal(pageName);
        add_entry_point_to_page_assets({entry_point: entry_point__autoreload, assetInfos, pageName});
    });
}
function add_browser_entry_points({assetInfos, pageBrowserEntries, browserEntryPoints}) {
    Object.values(browserEntryPoints)
    .forEach(entry_point => {
        assert_internal(entry_point.entry_name);
        Object.values(pageBrowserEntries)
        .forEach(({browserEntryOnlyCss, pageName}) => {
            assert_usage([true, false].includes(browserEntryOnlyCss));
            assert_internal(pageName);
            if( pageName===entry_point.entry_name ) {
                if( browserEntryOnlyCss ) {
                    add_entry_point_styles_to_page_assets({assetInfos, entry_point, pageName});
                } else {
                    add_entry_point_to_page_assets({assetInfos, entry_point, pageName});
                }
            }
        });
    });
}
function add_entry_point_to_page_assets({assetInfos, entry_point, removeIndex, pageName}) {
    assert_internal(pageName);
    assert_internal(!entry_point.entry_name.split('.').includes('noop'));

    const pageAssets = assetInfos.pageAssets[pageName] = assetInfos.pageAssets[pageName] || {};

    const {scripts} = entry_point;
    assert_internal(scripts.length>=1, entry_point);

    if( removeIndex!==undefined ) {
        pageAssets.scripts = make_paths_array_unique([
            ...pageAssets.scripts.slice(0, removeIndex),
            ...scripts,
            ...pageAssets.scripts.slice(removeIndex+1)
        ]);
    } else {
        pageAssets.scripts = make_paths_array_unique([
            ...(pageAssets.scripts||[]),
            ...scripts
        ]);
    }

    add_entry_point_styles_to_page_assets({assetInfos, entry_point, pageName});
}
function add_entry_point_styles_to_page_assets({assetInfos, entry_point, pageName}) {
    assert_internal(pageName);

    const pageAssets = assetInfos.pageAssets[pageName] = assetInfos.pageAssets[pageName] || {};

    const {styles} = entry_point;
    assert_internal(styles.length>=0, entry_point);

    pageAssets.styles = (
        make_paths_array_unique([
            ...(pageAssets.styles||[]),
            ...styles
        ])
    );

    pageAssets.scripts = pageAssets.scripts || [];
}
function make_paths_array_unique(paths) {
    assert_internal(
        paths.every(
            p => (
                p && p.constructor===Object ||
                p && p.constructor===String && p.startsWith('/')
            )
        ),
        paths
    );
    return [...new Set(paths)];
}
