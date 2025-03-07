import { EventEmitter } from '@jpbberry/typed-emitter'
import { Injectable } from '@nestjs/common'
import { Snowflake } from 'discord-api-types'
import { GuildData, GuildDB } from 'typings'

import patch from '../../utils/Patch'
import pieces from '../../utils/Pieces'
import { CacheService } from './cache.service'
import { DatabaseService } from './database.service'
import { FilterService } from './filter.service'
import { ThreadService } from './thread.service'

@Injectable()
export class GuildsService extends EventEmitter<{
  GUILD_SETTINGS_UPDATE: { id: Snowflake, db: GuildDB }
  GUILD_UPDATED: GuildData
}> {
  constructor (
    private readonly thread: ThreadService,
    private readonly database: DatabaseService,
    private readonly caching: CacheService,
    private readonly filter: FilterService
  ) {
    super()

    thread.on('GUILD_UPDATED', async (guildId) => {
      if (!this.caching.guilds.has(guildId)) return

      const guild = await this.getGuild(guildId)
      if (!guild) return

      this.caching.guilds.set(guildId, guild)
      this.emit('GUILD_UPDATED', guild)
    })
  }

  get db () {
    return this.database.collection('guild_data')
  }

  private async getGuild (guildId: Snowflake): Promise<GuildData> {
    const guild = await this.thread.sendCommand('GET_GUILD', { id: guildId })

    if (!guild || !guild.channels || !guild.roles) throw new Error('Not In Guild')

    return {
      guild: {
        name: guild.name,
        icon: guild.icon,
        id: guild.id,
        channels: guild.channels.map(x => ({
          id: x.id,
          name: x.name ?? '',
          type: x.type,
          parent_id: x.parent_id
        })),
        categories: [],
        roles: guild.roles.filter(x => !x.managed && x.id !== guild.id).map(x => ({
          id: x.id,
          name: x.name,
          color: x.color
        }))
      },
      premium: await this.database.guildPremium(guild.id),
      db: await this.database.config(guild.id)
    }
  }

  async get (id: Snowflake): Promise<GuildData> {
    const cached = this.caching.guilds.get(id)
    if (cached) return cached

    const guild = await this.getGuild(id)

    this.caching.guilds.set(id, guild)

    return guild
  }

  async set (id: Snowflake, db?: GuildDB): Promise<void> {
    const guild = await this.get(id)

    if (!db) db = guild.db

    if (guild.db.notInDb) {
      guild.db.notInDb = false
      await this.db.updateOne({ id }, {
        $set: guild.db
      }, { upsert: true })
    }

    const valid = this.database.schemas[guild.premium ? 'premium' : 'normal'].validate(db)
    if (valid.error) throw valid.error

    db.id = id

    db.filter = (db.filter || guild.db.filter).map(x => this.filter.resolve(x)[0]?.t).filter(x => x)

    await this.db.updateOne({
      id
    }, {
      $set: pieces.generate(db)
    })

    guild.db = patch(guild.db, db)

    this.caching.guilds.set(id, guild)

    this.database.configCache.delete(id)
    this.thread.tell('GUILD_DUMP', id)

    this.emit('GUILD_SETTINGS_UPDATE', { id, db })
  }
}
