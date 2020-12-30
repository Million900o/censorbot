import 'regenerator-runtime/runtime.js'

import { Loader } from './Loader'

import './typings/dom'
import './typings/api'

window.api = "abc"

window.onload = async () => {
  let devData
  if (new URLSearchParams(window.location.search).get('dev') === 'true') {
    devData = await fetch('/web.json').then(x => x.json())
  }

  window.__LOADER = new Loader(devData)
}