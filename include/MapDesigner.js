
export default class{

	// geoJSON for map display
	mapData = {
		nodes: {
			type: "FeatureCollection",
			features: []					
		},
		routes: {
			type: "FeatureCollection",
			features: []					
		},
		markers: []
	}

	// Mapbox map object
	map = null

	droneRange = 10
 
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
			// Startup
			this.initMapLayers()			// Prep mapbox layers
			this.startDOMListeners()	// Starter code change listeners

			// Load initial data
			this.codeChange('csv')		// Trigger initial builds
		})
	}

	// **********************************************************
	// Map stuff

	// Init the layers for map
	initMapLayers = () => {
		this.map.addSource('routes', {type: 'geojson', data: this.mapData.routes, 'promoteId': "id"})
		this.map.addLayer({
			'id': 'routes',
			'type': 'line',
			'source': 'routes',
			'layout': {
				'line-join': 'round',
				'line-cap': 'round'
			},
			'paint': {
				'line-color': `#ffc03a`,
				'line-width': 2,
				'line-blur': 2,
				'line-opacity': [
					'case', 
					['boolean', ['feature-state', 'withinDroneRange'], false],
					1,
					0
				]
			}
		})
	}

	// Add markers from geoJSON
	addMarkers = () => {
		// Clear old markers
		for(let marker of this.mapData.markers){
			marker.remove()
		}

		// Add markers again
		for (const feature of this.mapData.nodes.features) {
			// create a HTML element for each feature
			const el = document.createElement('div')
			el.className = 'marker'
			const newMarker = new mapboxgl.Marker(el).setLngLat(feature.geometry.coordinates).addTo(this.map)
			this.mapData.markers.push(newMarker)
		}

		this.generateRoutes()
	}

	generateRoutes = async () => {
		const points = this.mapData.nodes.features
		for (let start_index=0; start_index<(points.length-1); start_index++) {
			for (let end_index=start_index+1; end_index<points.length; end_index++) {
				const distance = turf.distance(points[start_index], points[end_index], {units: 'kilometers'})
				this.mapData.routes.features.push({
					type: "Feature",
					properties: {
						id: Math.random()*10000,
						from: '',
						end: '',
						distance: distance,
						withinDroneRange: false
					},
					geometry: {
						type: 'LineString',
						coordinates: [
							points[start_index].geometry.coordinates,
							points[end_index].geometry.coordinates,
						]
					}
				})
			}
		}

		// listener for sourcedata event.
		this.map.on('sourcedata', this.onSourceData);
		this.map.getSource('routes').setData(this.mapData.routes)
	}

	// Helper function to do first call to set drone range once the route data has been loaded onto the map
	onSourceData = (e) => {
		if (e.isSourceLoaded && e.sourceDataType != 'metadata'){ // I worked out these parameter checks by inspection and guesswork, may not be stable!
			this.map.off('sourcedata', this.onSourceData);
			this.setDroneRange(this.droneRange)
		}
	}

	// **********************************************************
	// Code change updates

	startDOMListeners = () => {
		this.options.dom.codeCSV.addEventListener("input", (e) => {
			this.codeChange('csv')
		})
		this.options.dom.codeGeoJSON.addEventListener("input", (e) => {
			this.codeChange('geoJSON')
		})
	}

	// ///////////////////////////////////////////////
	// Triggered whenever the code is changed in the CSV input window
	codeChange = (type) => {
		if(type == 'csv'){
			// Convert CSV to geoJSON
			const newCSV = this.options.dom.codeCSV.value.replace(/\t/gi,',')
			this.options.dom.codeCSV.value = newCSV
			const newGeoJSON = this.parseCSVtoGeoJSON(newCSV.trim())

			console.log(`Adding ${newGeoJSON.features.length} locations`)
			this.mapData.nodes = newGeoJSON
			this.options.dom.codeGeoJSON.value = JSON.stringify(this.mapData.nodes, null, 3)
			this.addMarkers()
		}
	}

	// ///////////////////////////////////////////////
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

	// **********************************************************
	// Drone range handling

	setDroneRange = (range) => {
		// Save the range
		this.droneRange = parseInt(range)
		console.log(`Drone range: ${this.droneRange}km`)

		// Clear all routes as being within drone range or not
		for(let feature of this.mapData.routes.features){
			this.map.setFeatureState(
				{source: 'routes', id: feature.properties.id},
				{withinDroneRange: false}
			)
		}
		
		// Filter routes by which ones are within range
		const validRoutes = this.map.querySourceFeatures('routes', {
			sourceLayer: 'routes',
			filter: [
				'all',
				['<', ['to-number', ['get', 'distance']], this.droneRange]
			]
		})
		console.log(validRoutes)
	
		// For each valid route, set the feature as being within range
		validRoutes.forEach((feature) => {
			this.map.setFeatureState(
				{source: 'routes', id: feature.id},
				{withinDroneRange: true}
			)
		})
	}
}