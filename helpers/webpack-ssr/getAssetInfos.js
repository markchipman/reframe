const assert_internal = require('reassert/internal');
const assert_usage = require('reassert/usage');
const forceRequire = require('@rebuild/build/utils/forceRequire');
const fs = require('fs');
const pathModule = require('path');
const {colorError} = require('@brillout/cli-theme');

let cache;

module.exports = getAssetInfos;

function getAssetInfos({outputDir, shouldBeProductionBuild}) {
    const assetInfos = readAssetMap({outputDir, shouldBeProductionBuild});

    if( cache && cache.buildTime === assetInfos.buildTime ) {
        return cache;
    }

    assetInfos.staticAssetsDir = makePathAbsolute(assetInfos.staticAssetsDir, {outputDir});

    assetInfos.pageAssets = (
        Object.entries(assetInfos.pageAssets)
        .map(([pageName, assets]) => {
            let {pageFileTranspiled, pageFile, styles, scripts} = assets;
            assert_internal(pageFile);
            assert_internal(pageFileTranspiled);
            assert_internal(styles.length>=0);
            assert_internal(scripts.length>=0);

            pageFile = makePathAbsolute(pageFile, {outputDir});
            pageFileTranspiled = makePathAbsolute(pageFileTranspiled, {outputDir});

            const pageExport = forceRequire(pageFileTranspiled);

            return {...assets, pageName, pageFileTranspiled, pageFile, pageExport};
        })
    );

    cache = assetInfos;

    return assetInfos;
}

function makePathAbsolute(pathRelative, {outputDir}) {
    assert_internal(!pathModule.isAbsolute(pathRelative));
    assert_internal(outputDir);
    return pathModule.resolve(outputDir, pathRelative);
}

function readAssetMap({outputDir, shouldBeProductionBuild}) {
    const assetMapPath = pathModule.resolve(outputDir, 'assetInfos.json');
    const assetMapContent = readFile(assetMapPath);
    assert_usage(
        assetMapContent!==null,
        colorError("You need to build your app")+". (E.g. by running `$ reframe build`.)",
        "(No asset information file `"+assetMapPath+"` found which should be generated when building.)"
    );
    const assetInfos = JSON.parse(assetMapContent)
    assert_usage(
        !shouldBeProductionBuild || assetInfos.buildEnv==='production',
        'Your app has been built for "'+assetInfos.buildEnv+'" but you need to '+colorError("build your app for production")+".",
        "(E.g. by running `$ reframe build`.)",
        "(The asset information file `"+assetMapPath+"` has `buildEnv` set to `"+assetInfos.buildEnv+"` but it should be `production`.)"
    );
    return assetInfos;
}

function readFile(filepath) {
    try {
        return fs.readFileSync(filepath, 'utf8');
    } catch(e) {
        return null;
    }
}
