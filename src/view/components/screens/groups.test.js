// import riot from 'riot'
import './groups.tag'

let tag

describe('groups', () => {
	beforeAll( () => {
		// create mounting point
		const elem = document.createElement('groups')

		// elem.setAttribute('name', 'world')
		document.body.appendChild(elem)

		tag = riot.mount(elem, 'groups')[0]
	})

	it('should mount the tag', () => {
		expect( document.querySelector('groups .groups-list').length )
	})
	it('should the tag has function loadData', () => {
		console.log( tag.loadData )
	})
	it('should the loadData() load data :)', async () => {
		const data = await tag.loadData()
		console.log( 'data exist:', data[0].id )
	})
})
