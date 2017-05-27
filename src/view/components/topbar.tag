<topbar>
	<div id="topbar">
		<h1>{opts.title}</h1>
	</div>

	<style type="less">
		#topbar {
			position: relative; z-index: 9;
			@bg:#5181b8;
			width: 100%; height:58px;

			background: @bg;
			box-shadow:0 0 5px rgba(0,0,0,0.5);

			h1 {
				text-transform: capitalize;
				color: #fff;
				padding: 17px 0 0 60px;
				font-size: 21px;
				white-space: nowrap;
				text-overflow: ellipsis;
				max-width: 85%;
				overflow: hidden;
			}

		}
	</style>
</topbar>
