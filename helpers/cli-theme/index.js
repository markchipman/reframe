const chalk = require('chalk');

const symbols = getSymbols();

let currentLoadingSpinner = null;

const cliTheme = {
    /*
    colorDir: chalk.green,
    colorFile: chalk.green,
    */
    colorDir: chalk.cyan,
    colorFile: chalk.cyan,

    colorEmphasis: chalk.cyan,
    colorEmphasisLight: chalk.bold,
    colorCmd: chalk.cyan,
    colorPkg: chalk.cyan,
    colorUrl: chalk.cyan,

    colorError: chalk.bold.red,
    colorWarning: chalk.yellow,

    colorDim: chalk.dim,

    symbolSuccess: chalk.cyan(' '+symbols.success+' '),
    symbolError: chalk.red(' '+symbols.error+' '),

    indent: '   ',

    strDir: dirPath => {
        const path = require('path');
        dirPath = dirPath + (dirPath.endsWith(path.sep) ? '' : path.sep)
        return cliTheme.strFile(dirPath);
    },
    strFile: filePath => {
        const relativeToHomedir = require('@brillout/relative-to-homedir');
        return relativeToHomedir(filePath);
    },
    loadingSpinner: {
        start: startLoadingSpinner,
        stop: stopLoadingSpinner,
    },
};

module.exports = cliTheme;

function startLoadingSpinner({text}={}) {
    const ora = require('ora');
    const assert_usage = require('reassert/usage');

    /*
    assert_usage(
        currentLoadingSpinner===null,
        "Trying to start the loading spinner but it already started"
    );
    */

    if( currentLoadingSpinner ) {
        return;
    }

    currentLoadingSpinner = ora({text});
    currentLoadingSpinner.start();
}

function stopLoadingSpinner() {
    const assert_usage = require('reassert/usage');

    /*
    assert_usage(
        currentLoadingSpinner,
        "Trying to end the loading spinner but it hasn't started"
    );
    */

    if( ! currentLoadingSpinner ) {
        return;
    }

    currentLoadingSpinner.stop();

    currentLoadingSpinner = null;
}

// Copied and adapted from https://www.npmjs.com/package/log-symbols
function getSymbols() {
    const isSupported = process.platform !== 'win32' || process.env.CI || process.env.TERM === 'xterm-256color';

    const main = {
        info: 'ℹ',
        success: '✔',
        warning: '⚠',
        error: '✖',
    };

    const fallbacks = {
        info: 'i',
        success: '√',
        warning: '‼',
        error: '×',
    };

    return isSupported ? main : fallbacks;
}
