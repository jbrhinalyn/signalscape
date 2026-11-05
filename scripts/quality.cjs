#!/usr/bin/env node
'use strict';

const { execFileSync } = require('node:child_process');
const { readFileSync, readdirSync, writeFileSync } = require('node:fs');
const { extname, join, relative } = require('node:path');
const ts = require('typescript');

const ROOT = join(__dirname, '..');
const DIRECTORIES = ['.github', 'docs', 'electron', 'scripts', 'src', 'tests'];
const ROOT_FILES = [
  '.env.example', '.gitignore', '.npmrc', '.nvmrc', 'CONTRIBUTING.md',
  'LICENSE', 'README.md', 'angular.json', 'package.json', 'package-lock.json',
  'tsconfig.json', 'tsconfig.app.json', 'tsconfig.electron.json',
];
const TEXT_EXTENSIONS = new Set([
  '.ts', '.cjs', '.css', '.html', '.json', '.md', '.svg', '.yml', '.yaml',
]);

function filesIn(directory) {
  return readdirSync(join(ROOT, directory), { withFileTypes: true })
    .flatMap((entry) => {
      const name = join(directory, entry.name);
      return entry.isDirectory() ? filesIn(name) : entry.isFile() ? [name] : [];
    });
}

function sourceFiles() {
  return [
    ...ROOT_FILES,
    ...DIRECTORIES.flatMap(filesIn),
  ].filter((name) =>
    ROOT_FILES.includes(name) || TEXT_EXTENSIONS.has(extname(name)),
  ).sort();
}

// Intentional lightweight formatter: preserve authored code, normalize line
// endings and trailing whitespace. This avoids changing Angular templates or
// introducing unpinned dependencies in the M1 foundation.
function normalizeText(input) {
  return input.replace(/\r\n?/g, '\n')
    .split('\n').map((line) => line.replace(/[ \t]+$/g, '')).join('\n')
    .replace(/\n*$/g, '\n');
}

function lintTypeScript(code, filename) {
  const errors = [];
  const file = ts.createSourceFile(filename, code, ts.ScriptTarget.Latest, true);
  for (const diagnostic of file.parseDiagnostics) {
    const position = file.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
    errors.push(`${filename}:${position.line + 1}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`);
  }

  function flag(node, description) {
    const position = file.getLineAndCharacterOfPosition(node.getStart(file));
    errors.push(`${filename}:${position.line + 1}: ${description}`);
  }

  function visit(node) {
    if (ts.isDebuggerStatement(node)) flag(node, 'debugger statements are prohibited');
    if (node.kind === ts.SyntaxKind.AnyKeyword) flag(node, 'explicit any is prohibited; use unknown or a typed contract');
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'eval') {
      flag(node, 'eval is prohibited');
    }
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Function') {
      flag(node, 'dynamic Function construction is prohibited');
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (/@ts-ignore\b/.test(code)) errors.push(`${filename}: @ts-ignore is prohibited; fix the type error`);
  return errors;
}

function lint() {
  const errors = [];
  for (const name of sourceFiles()) {
    const content = readFileSync(join(ROOT, name), 'utf8');
    if (name.endsWith('.ts')) errors.push(...lintTypeScript(content, name));
    if (name.endsWith('.json')) {
      try { JSON.parse(content); } catch (error) { errors.push(`${name}: invalid JSON: ${error.message}`); }
    }
    if (name.endsWith('.cjs')) {
      try {
        execFileSync(process.execPath, ['--check', join(ROOT, name)], { stdio: 'pipe' });
      } catch (error) {
        errors.push(`${name}: Node syntax validation failed: ${String(error.stderr || error.message)}`);
      }
    }
  }
  return errors;
}

function format(write = false) {
  const dirty = [];
  for (const name of sourceFiles()) {
    const fullPath = join(ROOT, name);
    const original = readFileSync(fullPath, 'utf8');
    const formatted = normalizeText(original);
    if (original === formatted) continue;
    dirty.push(relative(ROOT, fullPath));
    if (write) writeFileSync(fullPath, formatted, 'utf8');
  }
  return dirty;
}

function run(command) {
  if (command === 'lint') {
    const errors = lint();
    if (errors.length) {
      for (const error of errors) console.error(error);
      process.exitCode = 1;
    } else console.log('Lint passed: TypeScript AST rules, JavaScript syntax, and JSON validation.');
  } else if (command === 'format' || command === 'format:check') {
    const changed = format(command === 'format');
    if (changed.length) {
      console.log(`${command === 'format' ? 'Formatted' : 'Needs formatting'}: ${changed.join(', ')}`);
      if (command === 'format:check') process.exitCode = 1;
    } else console.log('Formatting passed.');
  } else {
    console.error('Usage: node scripts/quality.cjs <lint|format|format:check>');
    process.exitCode = 2;
  }
}

if (require.main === module) run(process.argv[2]);

module.exports = { normalizeText, lintTypeScript, sourceFiles };
