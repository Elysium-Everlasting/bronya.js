# @bronya.js/cli

## 0.11.4

### Patch Changes

- a2ae3b2: feat: pass route info to cdk prop overrides

## 0.11.3

### Patch Changes

- 1847395: feat/fix/perf: don't move or copy the temporary directory

## 0.11.2

### Patch Changes

- 0ea09ff: fix: generate random string for temp directory upload

## 0.11.1

### Patch Changes

- f3de8d8: feat: don't copy nested routes' out directories

## 0.11.0

### Minor Changes

- 17bcaff: fix: copy files recursively from the out directory to the upload directory

## 0.10.12

### Patch Changes

- 4acfaab: # feat: use separate config file for overrides
  - A configFile property is customizable on the api props which will be read to get config overrides.
  - By default, this will be the same as the root config file.
  - The root config file itself isn't customizable at this time.

## 0.10.11

### Patch Changes

- 1f265b8: fix: don't duplicate id for lambda name

## 0.10.10

### Patch Changes

- fa26c8d: feat: make option description optional

## 0.10.9

### Patch Changes

- 3841d5f: feat: handle headers during base64encoding

## 0.10.8

### Patch Changes

- c179992: feat: function plugins and removed built-in support for warming rule

## 0.10.7

### Patch Changes

- 62b25ae: feat: forward the different options for cli commands
- 72aad71: fix: actually forward the dev options

## 0.10.6

### Patch Changes

- 9595e3a: feat:

  - decompression for express.js integration
  - hooks for express.js handling

## 0.10.5

### Patch Changes

- 9518d99: fix: types versions and import paths

## 0.10.4

### Patch Changes

- 35dc6f3: feat: partial function props

## 0.10.3

### Patch Changes

- 59a0b69: feat: expose api prop overrides
- 86ada81: feat: await lambda upload modifications

## 0.10.2

### Patch Changes

- 11d69e2: feat: more sophisticated encoding for function name

## 0.10.1

### Patch Changes

- 1e07017: feat: copy all top-level files from the out directory to be uploaded

## 0.10.0

### Minor Changes

- f47f030: refactor: different file directory structure and testing

### Patch Changes

- 52d320b: feat: make sure directory is deleted before building

## 0.9.2

### Patch Changes

- 8dedd55: feat: adjusted regex and only upload the build directory
- 8dedd55: fix: the handler route is relative from the build directory

## 0.9.1

### Patch Changes

- 4c28b5b: fix: proper regex replace the js file path

## 0.9.0

### Minor Changes

- 93a38f8: fix: dev server should find parent directory of changed file, not project root

## 0.8.1

### Patch Changes

- e05bc4a: chore: version bump

## 0.8.0

### Minor Changes

- 0be42b1: feat: convert api gateway path to express path

## 0.7.1

### Patch Changes

- 6fdf84a: feat: improve matching for finding subprojects

## 0.7.0

### Minor Changes

- 0053ec7: feat: improved api override searching

## 0.6.2

### Patch Changes

- 47e1ec4: feat: query string parameters lazily computed and cached

## 0.6.1

### Patch Changes

- 07351c8: fix: wrong export paths

## 0.6.0

### Minor Changes

- be45cca: fix: adjust release workflow

## 0.5.0

### Minor Changes

- 097489c: fix: forgot to specify files field properly in package.json
- 097489c: fix: forgot prepublishing script

## 0.4.0

### Minor Changes

- 4527e73: fix: forgot to specify files field properly in package.json

## 0.3.0

### Minor Changes

- a7ecbb1: feat: ready for testing

## 0.2.0

### Minor Changes

- 0262426: feat: new release to npm
