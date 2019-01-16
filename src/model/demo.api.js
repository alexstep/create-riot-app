/*
 * jsonplaceholder.typicode.com
 * Fake Online REST API for Testing and Prototyping
 */

const demo_api_url = 'https://jsonplaceholder.typicode.com/'

export default new class API {
  constructor () {
    this.api_url = demo_api_url
  }

  get (method_name = false, params = {}) {
    if (!method_name) return

    let query = Object.keys(params)
      .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k]))
      .join('&')

    return fetch(this.api_url + method_name + '?' + query).then(r => {
      return r.json()
    })
  }
}()
