import type { Plugin } from '@bronya.js/core'

import type { Api } from '../api.js'

export type ApiPlugin = (api: Api) => Plugin | Plugin[]
