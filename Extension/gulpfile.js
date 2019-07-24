/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const gulp = require('gulp');
const env = require('gulp-env')
const tslint = require('gulp-tslint');
const mocha = require('gulp-mocha');
const fs = require('fs');
const optionsSchemaGenerator = require('./out/tools/GenerateOptionsSchema');
const nls = require('vscode-nls-dev');
const path = require('path');
const minimist = require('minimist');
const es = require('event-stream');
const sourcemaps = require('gulp-sourcemaps');
const ts = require('gulp-typescript');
const typescript = require('typescript');
const tsProject = ts.createProject('./tsconfig.json', { typescript });
const filter = require('gulp-filter');

const languages = [
    { id: "zh-TW", folderName: "cht", transifexId: "zh-hant" },
    { id: "zh-CN", folderName: "chs", transifexId: "zh-hans" },
    { id: "fr", folderName: "fra" },
    { id: "de", folderName: "deu" },
    { id: "it", folderName: "ita" },
    { id: "es", folderName: "esn" },
    { id: "ja", folderName: "jpn" },
    { id: "ko", folderName: "kor" },
    { id: "ru", folderName: "rus" },
    { id: "bg", folderName: "bul" },
    { id: "hu", folderName: "hun" },
    { id: "pt-br", folderName: "ptb", transifexId: "pt-BR" },
    { id: "tr", folderName: "trk" },
    { id: "cs", folderName: "csy" },
    { id: "pl", folderName: "plk" }
];

gulp.task('unitTests', (done) => {
    env.set({
            CODE_TESTS_PATH: "./out/test/unitTests",
        });

    return gulp.src('./test/runVsCodeTestsWithAbsolutePaths.js', {read: false})
        .pipe(mocha({ ui: "tdd" }))
        .once('error', err => {
            done();
            process.exit(1);
        })
        .once('end', () => {
            done();
            process.exit();
        });
});

/// Misc Tasks
const allTypeScript = [
    'src/**/*.ts',
    '!**/*.d.ts',
    '!**/typings**'
];

const lintReporter = (output, file, options) => {
    //emits: src/helloWorld.c:5:3: warning: implicit declaration of function ‘prinft’
    var relativeBase = file.base.substring(file.cwd.length + 1).replace('\\', '/');
    output.forEach(e => {
        var message = relativeBase + e.name + ':' + (e.startPosition.line + 1) + ':' + (e.startPosition.character + 1) + ': ' + e.failure;
        console.log('[tslint] ' + message);
    });
};

gulp.task('tslint', () => {
    return gulp.src(allTypeScript)
        .pipe(tslint({
            program: require('tslint').Linter.createProgram("./tsconfig.json"),
            configuration: "./tslint.json"
        }))
        .pipe(tslint.report(lintReporter, {
            summarizeFailureOutput: false,
            emitError: false
        }))
});

gulp.task('pr-check', (done) => {
    const packageJson = JSON.parse(fs.readFileSync('./package.json').toString());
    if (packageJson.activationEvents.length !== 1 && packageJson.activationEvents[0] !== '*') {
        console.log('Please make sure to not check in package.json that has been rewritten by the extension activation. If you intended to have changes in package.json, please only check-in your changes. If you did not, please run `git checkout -- package.json`.');
        done();
        process.exit(1);
    }

    done();
});

gulp.task('generateOptionsSchema', (done) => {
    optionsSchemaGenerator.generateOptionsSchema();
    done();
});

// Generate package.nls.*.json files from: ./i18n/*/package.i18n.json
const generatedAdditionalLocFiles = () => {
    return gulp.src(['package.nls.json'])
        .pipe(nls.createAdditionalLanguageFiles(languages, 'i18n'))
        .pipe(gulp.dest('.'));
};

// Generates ./dist/<src_path>/<filename>.nls.<language_id>.json, from files in ./i18n/*/<src_path>/<filename>.i18n.json
// Localized strings are read from these files at runtime.
// Also generates ./dist/nls.metadata.header.json and ./dist/nls.metadata.json, 
const generatedSrcLocFiles = () => {
    return tsProject.src()
        .pipe(sourcemaps.init())
        .pipe(tsProject()).js
        .pipe(nls.createMetaDataFiles())
        .pipe(nls.createAdditionalLanguageFiles(languages, "i18n"))
        .pipe(nls.bundleMetaDataFiles('ms-vscode.cpptools', 'out'))
        .pipe(filter(['**/*.nls.*.json', '**/*.nls.json', '**/nls.metadata.header.json', '**/nls.metadata.json']))
        .pipe(gulp.dest('dist'));
};

gulp.task('generateLocalizationFiles', gulp.series(generatedAdditionalLocFiles, generatedSrcLocFiles));


// These seem to be hold-overs from transifex, which is no longer used.
// createXlfFiles() requires 2 strings, but doesn't appear to use them.
const translationProjectName  = "ms-vscode";
const translationExtensionName  = "cpptools";


// Creates MLCP readable .xliff file and saves it locally
// generateLocalizationFiles must be run first to generate dependencies.
gulp.task("localization-export", function runTranslationExport() {
    return gulp.src(["package.nls.json", "dist/nls.metadata.header.json", "dist/nls.metadata.json"])
        .pipe(nls.createXlfFiles(translationProjectName, translationExtensionName))
        .pipe(gulp.dest(path.join("..", `localization-export`)));
});


// Imports localization from raw localized MLCP strings to VS Code .i18n.json files
gulp.task("translations-import", (done) => {
    var options = minimist(process.argv.slice(2), {
        string: "location",
        default: {
            location: "../vscode-cpptools-translations-import"
        }
    });
    es.merge(languages.map((language) => {
        let id = language.transifexId || language.id;

        // This path needs to be revisited once we iron out the process for receiving this xlf and running this scripts.
        return gulp.src(path.join(options.location, id, translationProjectName, `${translationExtensionName}.xlf`), { allowEmpty: true })
            .pipe(nls.prepareJsonFiles())
            .pipe(gulp.dest(path.join("./i18n", language.folderName)));
    }))
    .pipe(es.wait(() => {
        done();
    }));
});
