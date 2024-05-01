
export default class{

	// geoJSON for map display
	geoJSON = {
		type: 'FeatureCollection',
		features: [
			{
				type: 'Feature',
				geometry: {
					type: 'Point',
					coordinates: [-0.114136, 51.509356]
				},
				properties: {
					title: 'Mapbox',
					description: 'Washington, D.C.'
				}
			},
			{
				type: 'Feature',
				geometry: {
					type: 'Point',
					coordinates: [-122.414, 37.776]
				},
				properties: {
					title: 'Mapbox',
					description: 'San Francisco, California'
				}
			}
		]
	}
	markers = []

	// Mapbox map object
	map = null

	// Ratio
	metreToNmRatio = 0.0005399568 // 1m = x nautical miles
 
	// Default options are below
	options = {
		mapbox_token: '',
		mapbox_style: 'mapbox://styles/mapbox/light-v11',
		mapbox_view: {
			zoom: 9,
			centre: {
				lng: -0.114136,
				lat: 51.509356,
			}
		}
	}

	// **********************************************************
	// Constructor, to merge in options
	constructor(options){

		this.options = {...this.options, ...options}

		// Load map
		this.initMap()

	}

	// **********************************************************
	// Start the Sentry
	initMap = async () => {

		// Load the Mapbox map
		this.map = new mapboxgl.Map({
			accessToken: this.options.mapbox_token,
			container: this.options.dom.mapbox,
			style: this.options.mapbox_style,
			center: [this.options.mapbox_view.centre.lng, this.options.mapbox_view.centre.lat],
			zoom: this.options.mapbox_view.zoom,
		})

		// Once the map has loaded
		this.map.on('load', async () => {
			this.initMapLayers()
			this.addMarkers()
			this.startCodeChangeListeners()		// Starter code change listeners

			this.codeChange('csv')
		})
	}

	// **********************************************************
	// Map stuff

	// Init the layers for map
	initMapLayers = () => {
		this.map.addSource('locations', {'type':'geojson', 'data':this.geoJSON})
		this.map.addLayer({
			'id': 'locations',
			'type': 'fill',
			'source': 'locations',
			'layout': {},
			'paint': {}
		})
	}

	// Add markers from geoJSON
	addMarkers = () => {
		// Clear old markers
		for(let marker of this.markers){
			marker.remove()
		}

		// Add markers again
		for (const feature of this.geoJSON.features) {
			// create a HTML element for each feature
			const el = document.createElement('div')
			el.className = 'marker'
			const newMarker = new mapboxgl.Marker(el).setLngLat(feature.geometry.coordinates).addTo(this.map)
			this.markers.push(newMarker)
		}
	}

	// **********************************************************
	// Code change updates

	startCodeChangeListeners = () => {
		this.options.dom.codeCSV.addEventListener("input", (e) => {
			this.codeChange('csv')
	  })
	  this.options.dom.codeGeoJSON.addEventListener("input", (e) => {
			this.codeChange('geoJSON')
	 })
	}

	// ///////////////////////////////////////////////
	codeChange = (type) => {
		let newGeoJSON

		if(type == 'csv'){
			// Convert CSV to geoJSON
			const newCSV = this.options.dom.codeCSV.value.replace(/\t/gi,',')
			this.options.dom.codeCSV.value = newCSV
			newGeoJSON = this.parseCSVtoGeoJSON(newCSV.trim())
		}else if(type == 'geoJSON'){
			newGeoJSON = ''
		}

		if(newGeoJSON != ''){
			console.log(`Adding ${newGeoJSON.features.length} locations`)
			this.geoJSON = newGeoJSON
			this.options.dom.codeGeoJSON.value = JSON.stringify(this.geoJSON, null, 3)
			this.addMarkers()
		}
	}

	// ///////////////////////////////////////////////
	// TODO: Maybe some error checking needed here :D
	parseCSVtoGeoJSON = (csv) => {
		const newGeoJSON = {
			type: 'FeatureCollection',
			features: []
		}

		for(let row of csv.split('\n')){
			const parts = row.split(',')
			if(parts.length >= 2){
				// Add new geoJSON
				const newLocation = {
					type: 'Feature',
					geometry: {
						type: 'Point',
						coordinates: [parts[1], parts[0]]
					},
					properties: {
						title: 'Test point'
					}
				}
				newGeoJSON.features.push(newLocation)
			}
		}
		return newGeoJSON
	}
}