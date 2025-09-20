import React, { useState, useEffect } from 'react';
import { GoogleMap, LoadScript, Marker, DirectionsService, DirectionsRenderer, InfoWindow } from '@react-google-maps/api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMapMarkerAlt } from '@fortawesome/free-solid-svg-icons';

const MapPage = ({ pickupLocation, setPickupLocation, destination, setDestination, pickupLocationName, setPickupLocationName, destinationName, setDestinationName }) => {
  const [directions, setDirections] = useState(null); // Define directions state
  const [currentLocation, setCurrentLocation] = useState(null); // Define state for current location
  const [selectedMarker, setSelectedMarker] = useState(null); // Define state for selected marker

  const mapStyles = {
    height: '400px',
    width: '100%',
  };

  useEffect(() => {
    // Function to fetch current browser location
    const getCurrentLocation = () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((position) => {
          const currentLat = position.coords.latitude;
          const currentLng = position.coords.longitude;
          setCurrentLocation({ lat: currentLat, lng: currentLng });
        });
      } else {
        console.log("Geolocation is not supported by this browser.");
      }
    };

    getCurrentLocation(); // Call the function to fetch current location
  }, []); // Empty dependency array ensures this effect runs only once

  const handleMapClick = (e) => {
    const { latLng } = e;
    const lat = latLng.lat();
    const lng = latLng.lng();
    
    if (!pickupLocation) {
      setPickupLocation({ lat, lng });
    } 
    else if (!destination) {
      setDestination({ lat, lng });
    }
  };

  const directionsCallback = (response) => {
    if (response !== null && response.status === 'OK') {
      setDirections(response);
    }
  };

  useEffect(() => {
    if (pickupLocation && destination) {
      setDirections(null); // Reset directions when either pickupLocation or destination changes
    }
  }, [pickupLocation, destination]);

  const handleMarkerClick = (marker) => {
    setSelectedMarker(marker);
  };

  const handleCloseInfoWindow = () => {
    setSelectedMarker(null);
  };

  return (
    <div>
      {currentLocation && ( // Render map only when current location is available
        <LoadScript googleMapsApiKey="AIzaSyChykMQlbWKcQy-qixkVnXCrGVoy-vdlM4">
          <GoogleMap mapContainerStyle={mapStyles} zoom={15} center={currentLocation} onClick={handleMapClick}>
            {pickupLocation && (
              <Marker position={pickupLocation} onClick={() => handleMarkerClick(pickupLocation)}>
                <FontAwesomeIcon icon={faMapMarkerAlt} style={{ color: 'blue', fontSize: '24px' }} />
              </Marker>
            )}
            {destination && (
              <Marker position={destination} onClick={() => handleMarkerClick(destination)}>
                <FontAwesomeIcon icon={faMapMarkerAlt} style={{ color: 'red', fontSize: '24px' }} />
              </Marker>
            )}
            {pickupLocation && destination && (
              <DirectionsService
                options={{
                  destination,
                  origin: pickupLocation,
                  travelMode: 'TRANSIT',
                }}
                callback={directionsCallback}
              />
            )}
            {directions && <DirectionsRenderer directions={directions} />}
            {selectedMarker && (
              <InfoWindow position={selectedMarker} onCloseClick={handleCloseInfoWindow}>
                <div>
                  <p>Lat: {selectedMarker.lat}</p>
                  <p>Lng: {selectedMarker.lng}</p>
                </div>
              </InfoWindow>
            )}
          </GoogleMap>
        </LoadScript>
      )}
    </div>
  );
};

export default MapPage;
