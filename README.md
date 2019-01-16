# ⏏ create-riot-app
[![travis](https://travis-ci.org/alexstep/create-riot-app.svg?branch=master)](https://travis-ci.org/alexstep/create-riot-app-ejected/)
[![Code Climate](https://codeclimate.com/github/alexstep/create-riot-app-ejected.png)](https://codeclimate.com/github/alexstep/create-riot-app-ejected)
[![npm](https://img.shields.io/npm/v/npm.svg)]()
[![Dependencies](https://david-dm.org/alexstep/create-riot-app-ejected/dev-status.svg)](https://david-dm.org/alexstep/create-riot-app-ejected?type=dev)
[![Join the chat at https://gitter.im/create-riot-app/](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/create-riot-app/Lobby?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

[RiotJS](https://github.com/riot/riot) startkit, based on [create-react-app](https://github.com/facebookincubator/create-react-app) and  [react-scripts](https://github.com/facebookincubator/create-react-app/tree/master/packages/react-scripts).

[DEMO](https://ipfs.infura.io/ipfs/QmeYf7fabpUcEtUzb3Xsf5SJPbGGigPE9GTkwhrSS6cgDG/)

Package included simple app example, webpack dev server with **riot hot reload** and less, sass, stylus support. ES6 features available too. Jest with riot support for testing. ES6 and eslint in riot tag.

Just read https://github.com/facebookincubator/create-react-app/blob/master/packages/react-scripts/template/README.md but replace all "react" word to "riot" :)

[![See the video](https://j.gifs.com/VmEVBB.gif)](https://www.youtube.com/watch?v=dU2TsHzQA60)

## Features
* Hot .tag reload
* Realtime code linting
* Async/await (ES2017).
* Exponentiation Operator (ES2016).
* Object Rest/Spread Properties (stage 3 proposal).
* Dynamic import() (stage 3 proposal)
* Jest for .tag testing
* Generate all favicons and manifest.json
* Pre-commit testing

## Requirements
nodejs 10
and optionaly docker-compose, for deploy to ipfs

## ⚡ Start dev-server
```
git clone --depth=1 https://github.com/alexstep/create-riot-dapp my-riot-app
cd my-riot-app
rm -rf .git
```

```
npm install
npm start
```
go to http://localhost:9999

### Note
Riot route base url set in ./src/view/app.view.js line 47


## ⚛ Favicons and meta-information
Edit "meta" section in package.json ([see manifest format description](https://developer.mozilla.org/en-US/docs/Web/Manifest))
Put your app icon in ./src/favicon_source.svg or .png or other image format
and run
```
npm run meta:generate
```
manifest.json , browserconfig.xml, favicons and other meta-files will be generated and put to ./public/static/meta/ folder.

Also you can change some options in ./scripts/tools/metainfo/config.js



## ⚗ Build for production
```
npm run build
```

Check build result
```
npm run check_build
```


## ☁ Deploy


### Firebase
```
npm run deploy
```
For example you can deploy app to [firebase](firebase.google.com)
```
npm install -g firebase-tools
firebase login
firebase init
firebase deploy
```

### Your server
Change settings in scripts/tools/deploy_ssh
Add this file to .gitignore
```
npm run deploy:ssh
```
[About tool](https://www.npmjs.com/package/ssh-deploy-release)


# IPFS
```
npm run deploy:ipfs
```
Publish ./dist folder to [IPFS](https://ipfs.io) by defaults.
Need insatlled docker-composes/tools/deploy_ipfs/docker-compose.yml


### ⚙ Configuration options

Modify the ```.env``` file in the root of the generated project, and add any of the configuration options below 👇 to enable that feature.


## ☺ Contribute

Fork and send pull-request. Thank you!


