const nest = require('depnest')
const { h, Array: MutantArray, map, Struct, computed, watch, throttle, resolve } = require('mutant')
const Month = require('marama')
const pull = require('pull-stream')

exports.gives = nest({
  'app.page.calendar': true,
  'app.html.menuItem': true
})

exports.needs = nest({
  'app.sync.goTo': 'first',
  'keys.sync.id': 'first',
  'message.html.render': 'first',
  'message.sync.unbox': 'first',
  'sbot.async.get': 'first',
  'sbot.pull.stream': 'first',
  'scry.html.button': 'first',
  'gathering.html.button': 'first'
})

exports.create = (api) => {
  return nest({
    'app.html.menuItem': menuItem,
    'app.page.calendar': calendarPage
  })

  function menuItem () {
    return h('a', {
      'ev-click': () => api.app.sync.goTo({ page: 'calendar' })
    }, '/calendar')
  }

  function calendarPage (location) {
    const d = startOfDay()
    const state = Struct({
      today: d,
      year: d.getFullYear(),
      events: MutantArray([]),
      attending: MutantArray([]),
      range: Struct({
        gte: d,
        lt: endOfDay(d)
      })
    })

    watch(state.year, year => getGatherings(year, state.events, Query))
    watchAttending(state.attending, api)

    const actions = [
      api.scry.html.button(),
      api.gathering.html.button()
    ]

    const page = h('CalendarPage', { title: '/calendar' }, [
      Calendar(state, actions),
      Events(state, api)
    ])

    page.scroll = (i) => scroll(state.range, i)

    return page
  }

  function Query (opts) {
    return api.sbot.pull.stream(server => server.query.read(opts))
  }
}

function scroll (range, i) {
  const { gte, lt } = resolve(range)

  if (isMonthInterval(gte, lt)) {
    range.gte.set(new Date(gte.getFullYear(), gte.getMonth() + i, gte.getDate()))
    range.lt.set(new Date(lt.getFullYear(), lt.getMonth() + i, lt.getDate()))
    return
  }

  if (isWeekInterval(gte, lt)) {
    range.gte.set(new Date(gte.getFullYear(), gte.getMonth(), gte.getDate() + 7 * i))
    range.lt.set(new Date(lt.getFullYear(), lt.getMonth(), lt.getDate() + 7 * i))
    return
  }

  range.gte.set(new Date(gte.getFullYear(), gte.getMonth(), gte.getDate() + i))
  range.lt.set(new Date(lt.getFullYear(), lt.getMonth(), lt.getDate() + i))

  function isMonthInterval (gte, lt) {
    return gte.getDate() === 1 && // 1st of month
      lt.getDate() === 1 && // to the 1st of the month
      gte.getMonth() + 1 === lt.getMonth() && // one month gap
      gte.getFullYear() === lt.getFullYear()
  }

  function isWeekInterval (gte, lt) {
    return gte.getDay() === 1 && // from monday
      lt.getDay() === 1 && // to just inside monday
      new Date(gte.getFullYear(), gte.getMonth(), gte.getDate() + 7).toISOString() === lt.toISOString()
  }
}

function Events (state, api) {
  return h('CalendarEvents', { title: '' }, computed([state.events, state.range], (events, range) => {
    const keys = events
      .filter(ev => ev.date >= range.gte && ev.date < range.lt)
      .sort((a, b) => a.date - b.date)
      .map(ev => ev.data.key)

    const gatherings = MutantArray([])

    pull(
      pull.values(keys),
      pull.asyncMap((key, cb) => {
        api.sbot.async.get(key, (err, value) => {
          if (err) return cb(err)

          if (typeof value.content === 'object') cb(null, { key, value })
          else cb(null, api.message.sync.unbox({ key, value }))
        })
      }),
      pull.drain(msg => gatherings.push(msg))
    )

    return map(gatherings, g => api.message.html.render(g))
  }))
}

function watchAttending (attending, api) {
  const myKey = api.keys.sync.id()

  const query = [{
    $filter: {
      value: {
        author: myKey,
        content: {
          type: 'about',
          about: { $is: 'string' },
          attendee: { link: myKey }
        }
      }
    }
  }, {
    $map: {
      key: ['value', 'content', 'about'], // gathering
      rm: ['value', 'content', 'attendee', 'remove']
    }
  }]

  const opts = { reverse: false, live: true, query }

  pull(
    api.sbot.pull.stream(server => server.query.read(opts)),
    pull.filter(m => !m.sync),
    pull.filter(Boolean),
    pull.drain(({ key, rm }) => {
      var hasKey = attending.includes(key)

      if (!hasKey && !rm) attending.push(key)
      else if (hasKey && rm) attending.delete(key)
    })
  )
}

function getGatherings (year, events, Query) {
  // gatherings specify times with `about` messages which have a startDateTime
  // NOTE - this gets a window of about messages around the current year but does not gaurentee
  //        that we got all events in this year (e.g. something booked 6 months agead would be missed)
  const query = [{
    $filter: {
      value: {
        timestamp: { // ordered by published time
          $gt: Number(new Date(year - 1, 11, 1)),
          $lt: Number(new Date(year + 1, 0, 1))
        },
        content: {
          type: 'about',
          startDateTime: {
            epoch: { $is: 'number' }
          }
        }
      }
    }
  }, {
    $map: {
      key: ['value', 'content', 'about'],
      date: ['value', 'content', 'startDateTime', 'epoch'],
      ts: ['value', 'timestamp']
    }
  }]
  const opts = { reverse: false, live: true, query }

  var target
  pull(
    Query(opts),
    pull.filter(m => !m.sync),
    pull.filter(m => m.date > 0 && Number.isInteger(m.date)),
    pull.map(m => {
      m.date = new Date(m.date)
      return m
    }),
    pull.drain(({ key, date, ts }) => {
      target = events.find(ev => ev.data.key === key)
      if (target && target.data.ts <= ts) events.delete(target)
      // TODO causally sorted about messages
      // could do this with a backlinks query, paramap'd

      events.push({ date, data: { key, ts } })
    })
  )
}

// Thanks to nomand for the inspiration and code (https://github.com/nomand/Letnice),
// Calendar takes events of format { date: Date, data: { attending: Boolean, ... } }

const MONTH_NAMES = [ 'Ja', 'Fe', 'Ma', 'Ap', 'Ma', 'Ju', 'Ju', 'Au', 'Se', 'Oc', 'No', 'De' ]

function Calendar (state, actions) {
  // TODO assert events is an Array of object
  // of form { date, data }

  return h('Calendar', { title: '' }, [
    h('div.header', [
      h('div.year', [
        state.year,
        h('a', { 'ev-click': () => state.year.set(state.year() - 1) }, '-'),
        h('a', { 'ev-click': () => state.year.set(state.year() + 1) }, '+')
      ]),
      h('div.actions', actions)
    ]),
    h('div.months', computed(throttle(state, 100), ({ today, year, events, attending, range }) => {
      events = events.map(ev => {
        ev.data.attending = attending.includes(ev.data.key)
        return ev
      })

      return Array(12).fill(0).map((_, i) => {
        const setMonthRange = (ev) => {
          onSelect({
            gte: new Date(year, i, 1),
            lt: new Date(year, i + 1, 1)
          })
        }

        return h('div.month', [
          h('div.month-name', { 'ev-click': setMonthRange }, MONTH_NAMES[i]),
          Month({ year, monthIndex: i, events, range, onSelect, styles: { weekFormat: 'columns' } })
        ])
      })
    }))
  ])

  function onSelect ({ gte, lt }) {
    state.range.set({ gte, lt })
  }
}

function startOfDay (d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function endOfDay (d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
}
