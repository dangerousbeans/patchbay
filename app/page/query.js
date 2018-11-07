const nest = require('depnest')
const { h, Value, computed, when, resolve } = require('mutant')
const Scroller = require('mutant-scroll')
const next = require('pull-next-query')
const json5 = require('json5')
const get = require('lodash/get')
const isEqual = require('lodash/isEqual')

exports.gives = nest({
  'app.html.menuItem': true,
  'app.page.query': true
})

exports.needs = nest({
  'app.sync.goTo': 'first',
  'message.html.render': 'first',
  'sbot.pull.stream': 'first'
})

// TODO ?? extract a module patchbay-devtools ?
exports.create = function (api) {
  return nest({
    'app.html.menuItem': menuItem,
    'app.page.query': queryPage
  })

  function menuItem () {
    return h('a', {
      'ev-click': () => api.app.sync.goTo({ page: 'query' })
    }, '/query')
  }

  function queryPage (location) {
    const { initialOpts, initialValue } = getInitialState(location)

    const state = {
      opts: Value(initialOpts),
      input: Value()
    }

    const error = computed(state.input, i => {
      try {
        var newOpts = json5.parse(i)
      } catch (err) {
        // console.error(err)
        return err
      }
      // NOTE - this is the piece which auto-runs the quers
      if (!isValidOpts(newOpts)) return
      if (isEqual(resolve(state.opts), newOpts)) return
      state.opts.set(newOpts)
    })

    const activateQuery = () => state.opts.set(json5.parse(resolve(state.input)))

    const page = h('Query', { title: '/query' }, [
      h('section.query', [
        h('textarea', { 'ev-input': ev => state.input.set(ev.target.value), value: initialValue }),
        h('button', {
          className: when(error, '', '-primary'),
          disabled: when(error, 'disabled'),
          'ev-click': activateQuery
        }, 'Go!')
      ]),
      h('section.output', [
        computed(state.opts, opts => {
          return Scroller({
            streamToBottom: source(opts),
            render: buildRawMsg,
            comparer: (a, b) => {
              if (a && b && a.key && b.key) return a.key === b.key
              return a === b
            }
            // cb: console.error // TODO better error catching with stream
          })
        })
      ])
    ])

    page.scroll = () => {}
    return page
  }

  function source (opts) {
    return api.sbot.pull.stream(server => {
      var stepOn
      if (get(opts, 'query[0].$first.timestamp')) stepOn = ['timestamp']
      else if (get(opts, 'query[0].$first.value.timestamp')) stepOn = ['value', 'timestamp']

      const hasReduce = opts.query.some(el => Object.keys(el)[0] === '$reduce')

      if (opts.limit && stepOn && !hasReduce) return next(server.query.read, opts, stepOn)
      else return server.query.read(opts)
    })
  }
}

function getInitialState (location) {
  const { initialOpts, initialQuery, initialValue } = location
  if (isValidOpts(initialOpts)) {
    // TODO check initialValue === initialOpts
    return {
      initialOpts,
      initialValue: initialValue || json5.stringify(initialOpts, null, 2)
    }
  }
  if (isValidQuery(initialQuery)) {
    const opts = {
      reverse: true,
      query: initialQuery
    }
    return {
      initialOpts: opts,
      initialValue: json5.stringify(opts, null, 2)
    }
  }

  const defaultValue = defaulSSBQueryValue()

  return {
    initialOpts: json5.parse(defaultValue),
    initialValue: defaultValue
  }
}

function isValidOpts (opts) {
  if (!opts) return false
  if (typeof opts !== 'object') return false
  if (!isValidQuery(opts.query)) return false

  return true
}

function isValidQuery (query) {
  if (!Array.isArray(query)) return false
  if (!query.map(q => Object.keys(q)[0]).every(q => ['$filter', '$map', '$reduce'].includes(q))) return false

  return true
}

function defaulSSBQueryValue () {
  const day = 24 * 60 * 20 * 1e3
  return `{
  reverse: true,
  limit: 50,
  // live: true,
  // old: false // good with live: true
  query: [
    {
      $filter: {
        value: {
          timestamp: {$gt: ${Date.now() - day}},
          content: { type: 'post' }
        }
      }
    },
    {
      $map: {
        author: ['value', 'author'],
        text: ['value', 'content', 'text'],
        ts: {
          received: ['timestamp'],
          asserted: ['value', 'timestamp']
        }
      }
    },
    // {
    //   $reduce: {
    //     author: ['author'],
    //     count: { $count: true }
    //   }
    // }
  ]
}

// $filter - used to prune down results. This must be the first entry, as ssb-query uses it to determine the most optimal index for fast lookup.

// $map - optional, can be used to pluck data you want out. Doing this reduces the amount of data sent over muxrpc, which speeds up loading
`
}

// forked from message/html/meta/raw.js
// but modified

function buildRawMsg (msg) {
  return h('pre',
    linkify(colorKeys(splitLines(
      json5.stringify(msg, 0, 2)
    )))
  )
}

function splitLines (text) {
  const chunks = text.split(/(\n)/g)
  return chunks
}

function colorKeys (chunks) {
  var newArray = []
  chunks.forEach(chunk => {
    if (typeof chunk !== 'string') return newArray.push(chunk)

    var arr = chunk.split(/^(\s*\w+)/)
    for (var i = 1; i < arr.length; i += 2) {
      arr[i] = h('span', arr[i])
    }
    newArray = [...newArray, ...arr]
  })

  return newArray
}

function linkify (chunks) {
  var newArray = []
  chunks.forEach(chunk => {
    if (typeof chunk !== 'string') return newArray.push(chunk)

    // regex lifted from ssb-ref
    var arr = chunk.split(/((?:@|%|&)[A-Za-z0-9/+]{43}=\.[\w\d]+)/g)
    for (var i = 1; i < arr.length; i += 2) {
      arr[i] = h('a', { href: arr[i] }, arr[i])
    }
    newArray = [...newArray, ...arr]
  })

  return newArray
}
