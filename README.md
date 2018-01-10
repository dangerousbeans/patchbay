# Patchbay

`patchbay` is a secure-scuttlebutt client interface that is fully compatible with [patchwork](https://github.com/ssbc/patchwork).

![](./screenshot.png)

Patchbay is built using [patchcore](https://github.com/ssbc/patchcore) + [depject](https://github.com/dominictarr/depject). The goal is to make it easier to develop new features, and enable or disable features. This has so far been quite successful!

This makes in very easy to create say, a renderer for a new message type, or switch to a different method for choosing user names.


## Setup

Libsodium has some build dependencies. On ubuntu systems the following might help:

```sh
sudo apt-get install m4 libtool eclipse-cdt-autotools
```

On MacOS you may need the following packages installed (in this example, via [Homebrew](https://brew.sh/)):
```sh
brew install libtool automake autoconf
```

### Easy Install

This runs an embedded sbot with all the right plugins already installed.

```sh
git clone https://github.com/ssbc/patchbay.git
cd patchbay
npm install
npm run rebuild
```

Patchbay doesn't give you a way to join pubs yet, so this is good if you've already done that with another client (like Patchwork).


### Harder Install (full dev setup)

Install a standalone scuttlebot (your gossip server)
```sh
npm install scuttlebot@latest -g
```

Until https://github.com/ssbc/scuttlebot/pull/417 is resolved, you may need to do this instead:

```sh
git clone https://github.com/ssbc/scuttlebot.git
cd scuttlebot
git checkout ssb-private
npm install
npm link  // this should make sbot accessible globally
```

```sh
# make sure you have secure-scuttlebutt@15.5.2
npm ls secure-scuttlebutt -g

sbot server

# then in another tab (these must be separate commands)
sbot plugins.install ssb-about
sbot plugins.install ssb-backlinks
sbot plugins.install ssb-fulltext # for faster searches
sbot plugins.install ssb-chess-db # for chess

After that you need to make sure that .ssb/config reads: "ssb-chess-db": "ssbChessIndex" for chess to work.

# restart sbot server (go back to previous tab and kill it)
```

Restart your sbot, then (optionally) use an invite code. This will give you your first friend, from which point you can find others:
```sh
sbot invite.accept LONG_INVITE_CODE_MAYBE_IN_QUOTES
```

Install Patchbay
```sh
git clone https://github.com/ssbc/patchbay.git
cd patchbay
npm install
npm run rebuild
```

## Running the desktop app


Easy mode (embedded sbot):
```sh
# from the patchbay repo folder
npm start
```

Harder mode:
```sh
sbot server

# from the patchbay repo folder
npm run dev
```

## How to add a feature

To add a new message type, add add a js to `./modules/` that exports a function named `message_content` (it should return an HTML element). To add a new tab, export a function named `screen_view` (returns an html element).

To add a new detail, that appears above a message, export a function named `message_meta`.

See the code for more examples.


## Keyboard shortcuts

## Tabs 

`h` : tabs left
`j` : tabs right
`x` : close tab

## Message feeds

`j` : next message (down)
`k` : previous message
`o` : open message thread (and scroll to position of this message in that thread)
` ` ` : toggle raw message view for currently selected message (` ` ` = backtick, lives on the same key as `~`)

composing : cttrl + enter = post

## Nav bar thing

`@` : start a person query
`#` : start a channel query
`?` : start a search query
`/` : start a navigation  (e.g. /public)  - need to re-instate suggestions for this

you can also paste a message id (starts with `%`) in here to navigate to it. Same with blobs (`&`)


## Module graph

TODO - reinstate this

## License

MIT


