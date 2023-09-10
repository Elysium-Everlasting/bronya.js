---
'@bronya.js/api-construct': patch
'@bronya.js/cli': patch
'@bronya.js/core': patch
---

# feat: use separate config file for overrides
- A configFile property is customizable on the api props which will be read to get config overrides.
- By default, this will be the same as the root config file.
- The root config file itself isn't customizable at this time.
