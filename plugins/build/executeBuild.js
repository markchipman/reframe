const Build = require('webpack-ssr/Build');
const watchDir = require('webpack-ssr/watchDir');

const projectConfig = require('@brillout/reconfig').getConfig({configFileName: 'reframe.config.js'});

const outputDir = projectConfig.projectFiles.buildOutputDir;
const getPageFiles = () => projectConfig.getPageConfigFiles();
const getWebpackBrowserConfig = ({config, ...utils}) => projectConfig.webpackBrowserConfigModifier({config, ...utils});
const getWebpackNodejsConfig = ({config, ...utils}) => projectConfig.webpackNodejsConfigModifier({config, ...utils});
const {log, doNotWatchBuildFiles} = projectConfig;
const {pagesDir} = projectConfig.projectFiles;
const {getPageHtmls, getPageBrowserEntries} = projectConfig;

const build = new Build({
    outputDir,
    getPageFiles,
    getPageBrowserEntries,
    getPageHtmls,
    getWebpackBrowserConfig,
    getWebpackNodejsConfig,
    log,
    doNotWatchBuildFiles,
});

watchDir(pagesDir, () => {build()});

module.exports = build();
