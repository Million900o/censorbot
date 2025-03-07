import React from 'react'

import { GuildData, ShortGuild, User } from 'typings'
import { Utils } from 'utils/Utils'
import { Logger } from './Logger'
import { WebsocketManager } from './WebsocketManager'

import Router from 'next/router'
import { Snowflake } from 'discord-api-types'
import { updateObject } from 'utils/updateObject'
import Pieces from 'utils/Pieces'
import Swal from 'sweetalert2'

export enum LoginState {
  Loading = 0,
  LoggedOut,
  LoggingIn,
  LoggedIn
}

export interface ApiData {
  user?: User
  guilds?: ShortGuild[]
  login: LoginState
  currentGuild?: GuildData
}

export const DataContext = React.createContext({} as ApiData)

export class Api {
  static logger = Logger

  private readonly waitingUser: Array<(user: User | undefined) => void> = []

  static ws = new WebsocketManager()

  static log (msg: string) {
    Logger.log('API', msg)
  }

  static get guildId () {
    if (!('window' in global)) return undefined

    return location.href.split('/')[4]?.match(/[0-9]{5,}/)?.[0] as Snowflake | undefined
  }

  static get token () {
    return Utils.getCookie('token')
  }

  static async login (required: boolean = false) {
    const user = await Utils.openWindow('/api/auth/discord', 'Login')
      .then(async () => await this.getUser())

    if (!user) {
      Logger.error('Failed to authorize')
      if (required) void Router.push('/')
    }

    return user
  }

  static logout () {
    this.ws.tell('LOGOUT')

    document.cookie = 'token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;'

    if (Router.pathname.includes('dashboard')) void Router.push('/')
  }

  // handleOpen () {
  //   if (this.token) {
  //     void this.updateUser()
  //   } else this.setData({ login: LoginState.LoggedOut })
  // }

  static async getUser () {
    if (!this.token) return undefined
    this.log('Retrieving user')

    const user = await this.ws.request('AUTHORIZE', { token: this.token, customer: false })

    return user
  }

  static async getGuilds () {
    this.log('Retrieving guilds')
    const guilds = await this.ws.request('GET_GUILDS').catch(() => null)

    if (!guilds) return

    return guilds
  }

  static async getGuild (id: Snowflake): Promise<GuildData|undefined> {
    this.log(`Subscribing to ${id}`)

    const guild = await this.ws.request('SUBSCRIBE', id)
      .catch(err => {
        if (err === 'Not In Guild') {
          return Swal.fire({
            text: 'Censor Bot is not in this server yet!',
            showConfirmButton: true,
            showCancelButton: true,
            imageUrl: 'https://static.jpbbots.org/censorbot.svg',
            imageWidth: 116,
            confirmButtonText: 'Invite'
          }).then(res => {
            if (res.isConfirmed) {
              return Utils.openWindow('/invite?id=' + id)
                .then(async () => {
                  return await this.getGuild(id)
                })
            } else {
              void Router.push('/dashboard')
            }
          })
        } else if (err === 'Unauthorized') {
          Logger.error('You don\'t have access to this server')
          void Router.push('/dashboard')
        }
        return null
      })

    if (!guild) return

    return guild
  }

  static _createUpdatedGuild (current: GuildData, newDb: any) {
    const obj = Object.assign({}, current)
    obj.db = updateObject(obj.db, Pieces.normalize(newDb))

    return obj
  }

  static waiting?: any
  static timeout?: number
  static resolve?: () => void

  static _resetTimer () {
    if (!this.timeout) return
    console.log('resetting timer')
    clearTimeout(this.timeout)

    this.timeout = window.setTimeout(() => {
      this.resolve?.()
    }, 1000)
  }

  static async changeSettings (id: Snowflake, data: any) {
    Logger.setLoading(true)

    if (!this.waiting) this.waiting = data
    else {
      this.waiting = updateObject(this.waiting, data)
      this._resetTimer()

      return
    }

    this.timeout = window.setTimeout(() => {
      this.resolve?.()
    }, 1000)

    await new Promise<void>(resolve => {
      this.resolve = resolve
    })

    data = this.waiting
    this.waiting = undefined
    this.resolve = undefined
    this.timeout = undefined
    console.debug('posting', data)

    await this.ws.request('CHANGE_SETTING', { id, data })
    Logger.setLoading(false)
  }

  static async unsubscribe (id: Snowflake) {
    this.log(`Unsubscribing from ${id}`)

    this.ws.tell('UNSUBSCRIBE', id)
  }
}

// if ('window' in global) {
//   window.api = Api
// }
