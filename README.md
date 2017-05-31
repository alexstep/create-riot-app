# ⏏ create-riot-app
[![Code Climate](https://codeclimate.com/github/alexstep/create-riot-app-ejected.png)](https://codeclimate.com/github/alexstep/create-riot-app-ejected)
[![Dependencies](https://david-dm.org/alexstep/create-riot-app-ejected/dev-status.svg)](https://david-dm.org/alexstep/create-riot-app-ejected?type=dev)

[RiotJS](https://github.com/riot/riot) startkit, based on [create-react-app](https://github.com/facebookincubator/create-react-app) and  [custom-react-scripts](https://github.com/kitze/custom-react-scripts).

Package included simple app example, webpack dev server with riot-loader and less,sass,stylus,css-components support. ES6 features available too.

Just read https://github.com/facebookincubator/create-react-app but replace all "react" word to "riot" :)


## ⚙ Start dev-server
```
git clone https://github.com/alexstep/create-riot-app-ejected my-riot-app
cd my-riot-app
```
```
npm install
npm start
```
go to http://localhost:9999


## ⚡ Build for production
```
npm run build
```



### ✎ Configuration options

Modify the ```.env``` file in the root of the generated project, and add any of the configuration options below 👇 to enable that feature.

The generated project comes with SASS, LESS, and CSS modules support by default, but you can remove them at any time by removing the options from the ```.env``` file.

#### Styling
- ```APP_SASS=true``` - enable SASS support
- ```APP_LESS=true``` - enable LESS support
- ```APP_STYLUS=true``` - enable Stylus support
- ```APP_CSS_MODULES``` - enable CSS modules

#### Babel
- ```APP_BABEL_STAGE_0=true``` - enable stage-0 Babel preset
- ```APP_DECORATORS=true``` - enable decorators support

> ⚠ Please note that the Babel features are highly experimental (especially stage-0) and still not a part of the ES specification.
> Use them at your own risk of breaking backwards compatibility if they don't make the final version of the spec.

#### Others
- ```PORT=3015``` - change default port (supported in CRA by default)
- ```OPEN_BROWSER=false``` - don't open browser after running webpack server




## ⚇ Contribute

Fork and send pull-request. Thank you!


