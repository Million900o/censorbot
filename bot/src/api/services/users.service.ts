import { EventEmitter } from '@jpbberry/typed-emitter'
import { Injectable } from '@nestjs/common'
import { User, UserPremium } from 'typings'

import { CacheService } from './cache.service'
import { ChargeBeeService } from './chargebee.service'
import { DatabaseService } from './database.service'
import { InterfaceService } from './interface.service'

@Injectable()
export class UsersService extends EventEmitter<{
  USER_UPDATE: User
}> {
  constructor (
    private readonly database: DatabaseService,
    private readonly int: InterfaceService,
    private readonly caching: CacheService,
    private readonly chargebee: ChargeBeeService
  ) {
    super()
  }

  get db () {
    return this.database.collection('users')
  }

  async login (token: string) {
    const user = await this.db.findOne({ token })
    if (!user) throw new Error('Invalid Token')

    const extendedUser = await this.extendUser(user)

    this.caching.users.set(extendedUser.id, extendedUser)

    return extendedUser
  }

  async extendUser (user: User): Promise<User> {
    user.admin = await this.int.api.isAdmin(user.id)

    const prem = await this.chargebee.getAmount(user.id)

    const premium: UserPremium = {
      count: 0,
      guilds: [],
      customer: false
    }
    if (prem.amount > 0) {
      premium.count = prem.amount
      premium.customer = prem.customer

      let premiumUser = await this.database.collection('premium_users').findOne({ id: user.id })
      if (!premiumUser) {
        premiumUser = {
          id: user.id,
          guilds: []
        }
        await this.database.collection('premium_users').updateOne({ id: user.id }, { $set: premiumUser }, { upsert: true })
      }
      premium.guilds = premiumUser.guilds
    }

    user.premium = premium

    return user
  }
}
