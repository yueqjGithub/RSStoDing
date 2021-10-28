import axios from 'axios'

const Axios = axios.create({
  timeout: 300000
})

Axios.interceptors.request.use(config => {
  // config.headers.Referer = config.url.split('/').slice(0,3).join('/')
  return config
})
export { Axios }