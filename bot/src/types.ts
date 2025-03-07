import { Snowflake } from 'discord-api-types'
import { ShortID } from 'typings'

export const Reloaders = ['COMMANDS', 'FILTER', 'CACHE', 'FILTERS'] as const

export type ReloadNames = typeof Reloaders[number]

export interface CustomerSchema {
  /**
   * Discord User ID
   */
  id: Snowflake
  /**
   * Customer ChargeBee ID
   */
  customer: string
}

declare module 'discord-rose/dist/clustering/ThreadComms' {
  interface ThreadEvents {
    RELOAD: {
      send: ReloadNames
      receive: ReloadNames
    }
    GUILD_DUMP: {
      send: Snowflake
      receive: null
    }
    RELOAD_WEBSOCKETS: {
      send: null
      receive: null
    }
    CREATE_HELPME: {
      send: { id: Snowflake }
      receive: ShortID
    }
    GET_HELPME: {
      send: { code: ShortID }
      receive: Snowflake
    }
    GUILD_UPDATED: {
      send: Snowflake
      receive: null
    }
  }
}
