<spinner>
	<div id="spinner">
		<div class="showbox">
		<div class="loader">
			<svg class="circular" viewBox="25 25 50 50">
			<circle class="path" cx="50" cy="50" r="20" fill="none" stroke-width="2" stroke-miterlimit="10"/>
			</svg>
		</div>
		</div>

		<div class="text">{opts.text}</div>
	</div>

	<style type="less">
		#spinner {
			position: relative;

			@green:  #008744;
			@blue:   #0057e7;
			@red:    #d62d20;
			@yellow: #ffa700;
			@white:  #eee;

			// scaling... any units
			@width: 100px;

			.text {
				position: absolute;
				top: 340px; left: 0; right: 0;
				display: block; text-align: center;
				color:#777;
			}

			.showbox {
				position: absolute;
				top: 100px;
				bottom: 0;
				left: 0;
				right: 0;
				padding: 5%;
			}
			// end demo-specific

			.loader {
				position: relative;
				margin: 0 auto;
				width: @width;
				&:before {
					content: '';
					display: block;
					padding-top: 100%;
				}
			}

			.circular {
				animation: rotate 2s linear infinite;
				height: 100%;
				transform-origin: center center;
				width: 100%;
				position: absolute;
				top: 0;
				bottom: 0;
				left: 0;
				right: 0;
				margin: auto;
			}

			.path {
				stroke-dasharray: 1, 200;
				stroke-dashoffset: 0;
				animation: dash 1.5s ease-in-out infinite, color 6s ease-in-out infinite;
				stroke-linecap: round;
			}

			@keyframes rotate {
				100% {
					transform: rotate(360deg);
				}
			}

			@keyframes dash {
				0% {
					stroke-dasharray: 1, 200;
					stroke-dashoffset: 0;
				}
				50% {
					stroke-dasharray: 89, 200;
					stroke-dashoffset: -35px;
				}
				100% {
					stroke-dasharray: 89, 200;
					stroke-dashoffset: -124px;
				}
			}

			@keyframes color {
				100%,
				0% {
					stroke: @red;
				}
				40% {
					stroke: @blue;
				}
				66% {
					stroke: @green;
				}
				80%,
				90% {
					stroke: @yellow;
				}
			}

		}
	</style>

</spinner>
