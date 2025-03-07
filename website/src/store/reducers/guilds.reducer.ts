import { DeepPartial } from '@chakra-ui/react'
import { createSlice, current, PayloadAction } from '@reduxjs/toolkit'
import { GuildData, GuildDB, ShortGuild } from 'typings'
import { updateObject } from 'utils/updateObject'

export interface GuildsContextType {
  guilds?: ShortGuild[]
  currentGuild?: GuildData
  volatileDb?: GuildDB
}

const initialState: GuildsContextType = {}

const slice = createSlice({
  name: 'guilds',
  initialState: initialState,
  reducers: {
    setGuilds: (state, action: PayloadAction<ShortGuild[]|undefined>) => {
      state.guilds = action.payload
    },
    setCurrentGuild: (state, action: PayloadAction<GuildData|undefined>) => {
      state.currentGuild = action.payload
      state.volatileDb = action.payload?.db
    },
    setDb: (state, action: PayloadAction<DeepPartial<GuildDB>>) => {
      if (state.currentGuild) {
        const newDb = updateObject(current(state.currentGuild.db), action.payload)
        state.currentGuild.db = newDb
        state.volatileDb = newDb
      }
    },
    setVolatileDb: (state, action: PayloadAction<DeepPartial<GuildDB>>) => {
      if (state.currentGuild) {
        state.volatileDb = updateObject(current(state.volatileDb), action.payload)
      }
    }
  }
})

export const guildsReducer = slice.reducer
export const { setGuilds, setCurrentGuild, setDb, setVolatileDb } = slice.actions
