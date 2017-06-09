# ⏏ create-riot-app
[![Code Climate](https://codeclimate.com/github/alexstep/create-riot-app-ejected.png)](https://codeclimate.com/github/alexstep/create-riot-app-ejected)
[![npm](https://img.shields.io/npm/v/npm.svg)]()
[![Dependencies](https://david-dm.org/alexstep/create-riot-app-ejected/dev-status.svg)](https://david-dm.org/alexstep/create-riot-app-ejected?type=dev)

[RiotJS](https://github.com/riot/riot) startkit, based on [create-react-app](https://github.com/facebookincubator/create-react-app) and  [react-scripts](https://github.com/facebookincubator/create-react-app/tree/master/packages/react-scripts).


Package included simple app example, webpack dev server with **riot hot reload** and less, sass, stylus support. ES6 features available too. Jest with riot support for testing. ES6 and eslint in riot tag.

Just read https://github.com/facebookincubator/create-react-app/blob/master/packages/react-scripts/template/README.md but replace all "react" word to "riot" :)

[![See the video](https://j.gifs.com/VmEVBB.gif)](https://www.youtube.com/watch?v=dU2TsHzQA60)



## ⚡ Start dev-server
```
git clone https://github.com/alexstep/create-riot-app-ejected my-riot-app
cd my-riot-app
```
```
npm install
npm start
```
go to http://localhost:9999


## ✔ Testing
```
npm test
npm test -- --coverage
```
[read more](https://github.com/facebookincubator/create-react-app/blob/master/packages/react-scripts/template/README.md#running-tests) about testing

Add flow type checker.
```
npm install flow-bin
npm run flow
```
Write in head your js files `//@flow weak` to enable flow checker


## ⚗ Build for production
```
npm run build
```

Check build result
```
npm run check_build
```


## ☁ Deploy

For example deploy app to [firebase](firebase.google.com)
```
npm install -g firebase-tools
firebase login
firebase init
npm run deploy
```


### ⚙ Configuration options

Modify the ```.env``` file in the root of the generated project, and add any of the configuration options below 👇 to enable that feature.

The generated project comes with LESS support by default, but you can add SASS or Stylus at any time by edit the options from the ```.env``` file.

#### Styling
- ```enable_less=true``` - enable LESS support
- ```enable_sass=true``` - enable SASS support
- ```enable_stylus=true``` - enable Stylus support

#### Others
- ```HTTPS=true``` - enable https in localhost
- ```PORT=9999``` - change port
- ```OPEN_BROWSER=false``` - don't open browser after running webpack server

[Read more](https://github.com/facebookincubator/create-react-app/blob/master/packages/react-scripts/template/README.md#adding-custom-environment-variables) about .env files



## ☺ Contribute

Fork and send pull-request. Thank you!


