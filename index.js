const fs = require('fs');
const util = require('util');
const get = require('lodash.get');
const set = require('lodash.set');
const castArray = require('lodash.castarray');
const detectIndent = require('detect-indent');
const yaml = require('js-yaml');
const { Plugin } = require('release-it');

const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);
const noop = Promise.resolve();

const parseFileOption = (option) => {
  const file = typeof option === 'string' ? option : option.file;
  const type =
    (typeof option !== 'string' && option.type) || 'application/json';
  const path = (typeof option !== 'string' && option.path) || 'version';
  return { file, type, path };
};

class Bumper extends Plugin {
  async getLatestVersion() {
    const { in: _in } = this.options;
    if (!_in) return;
    const { file, type, path } = parseFileOption(_in);
    let version = null;
    if (file) {
      const data = await readFile(file);
      if (type === 'application/json') {
        const parsed = JSON.parse(data);
        version = get(parsed, path);
      } else if (type === 'text/plain') {
        version = data.toString().trim();
      }
    }
    return version;
  }

  bump(version) {
    const { out } = this.options;
    const { isDryRun } = this.global;
    if (!out) return;
    return Promise.all(
      castArray(out).map(async (out) => {
        const { file, type, path } = parseFileOption(out);

        this.log.exec(`Writing version to ${file}`, isDryRun);

        if (isDryRun) return noop;

        if (type === 'application/json') {
          const data = await readFile(file, 'utf8').catch(() => '{}');
          const indent = detectIndent(data).indent || '  ';
          const parsed = JSON.parse(data);
          if (typeof path === 'string') {
            set(parsed, path, version);
          } else {
            path.map((path) => {
              set(parsed, path, version);
            });
          }
          return writeFile(file, JSON.stringify(parsed, null, indent) + '\n');
        } else if (type === 'text/yaml' || type === 'application/x-yaml') {
          const data = await readFile(file, 'utf8').catch(() => '{}');
          const indent = detectIndent(data).indent || '  ';
          const parsed = yaml.safeLoad(data);
          set(parsed, path, version);
          return writeFile(
            file,
            yaml.safeDump(parsed, { indent: indent.length }) + '\n'
          );
        } else if (type.startsWith('text/')) {
          const { latestVersion } = this.config.contextOptions;
          const read = await readFile(file, 'utf8').catch(() => latestVersion);
          const versionMatch = new RegExp(
            (latestVersion || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
            'g'
          );
          const write = read ? read.replace(versionMatch, version) : version;
          return writeFile(file, write);
        }
      })
    );
  }
}

module.exports = Bumper;
