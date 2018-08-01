const nest = require('depnest')
const { h } = require('mutant')
const pull = require('pull-stream')
const Scroller = require('pull-scroll')
const next = require('pull-next-query')

exports.gives = nest({
  'app.html.menuItem': true,
  'app.page.notifications': true
})

exports.needs = nest({
  'app.html.filter': 'first',
  'app.html.scroller': 'first',
  'app.sync.goTo': 'first',
  'feed.pull.public': 'first',
  'keys.sync.id': 'first',
  'message.html.render': 'first',
  'message.sync.isBlocked': 'first',
  'sbot.pull.stream': 'first'
})

exports.create = function (api) {
  return nest({
    'app.html.menuItem': menuItem,
    'app.page.notifications': notificationsPage
  })

  function menuItem () {
    return h('a', {
      style: { order: 3 },
      'ev-click': () => api.app.sync.goTo({ page: 'notifications' })
    }, '/notifications')
  }

  function notificationsPage (location) {
    const { filterMenu, filterDownThrough, filterUpThrough, resetFeed } = api.app.html.filter(draw)
    const { container, content } = api.app.html.scroller({ prepend: [ filterMenu ] })

    function draw () {
      resetFeed({ container, content })

      pull(
        pullMentions({old: false, live: true}),
        filterDownThrough(),
        Scroller(container, content, api.message.html.render, true, false)
      )

      pull(
        pullMentions({reverse: true, live: false}),
        filterUpThrough(),
        Scroller(container, content, api.message.html.render, false, false)
      )
    }
    draw()

    container.title = '/notifications'
    return container
  }

  // NOTE - this currently hits mentions AND the patchwork message replies
  function pullMentions (opts) {
    const query = [{
      $filter: {
        dest: api.keys.sync.id(),
        timestamp: {$gt: 0},
        value: {
          author: {$ne: api.keys.sync.id()}, // not my messages!
          private: {$ne: true} // not private mentions
        }
      }
    }]

    const _opts = Object.assign({
      query,
      limit: 100,
      index: 'DTA'
    }, opts)
    console.log(_opts)

    return api.sbot.pull.stream(server => {
      return pull(
        next(server.backlinks.read, _opts, ['timestamp']),
        pull.filter(m => !api.message.sync.isBlocked(m))
      )
    })
  }
}
