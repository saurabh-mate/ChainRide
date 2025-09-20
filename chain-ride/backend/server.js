const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const PORT = 3001;

// Connect to MongoDB (mongodb://localhost:27017)
// Read Mongo URL from environment variable (set in docker-compose.yml)
const mongoURL = process.env.MONGO_URL || 'mongodb://localhost:27017/ridesharingapp';

// Optional: retry loop in case Mongo is not ready yet
const connectWithRetry = () => {
  mongoose.connect(mongoURL, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => {
      console.error('MongoDB connection unsuccessful, retrying in 5 seconds...', err);
      setTimeout(connectWithRetry, 5000);
    });
};

connectWithRetry();


// Define user schema
const userSchema = new mongoose.Schema({
  username: String,
  email: String,
  contact: String,
  currentLocation: String,
  userImage: String,
  etheriumAddress: String,
  userType: String,
  userCreatedTime: { type: Date, default: Date.now }
});

const rideSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    driver_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver' }, // Add driver_id field
    ride_date: Date,
    ride_location: String,
    ride_fare: Number,
    time: String,
    ride_status: { type: String, default: 'requested' } // Set default status to 'requested'
  });
  

// Create User and Ride models
const User = mongoose.model('User', userSchema);
const Ride = mongoose.model('Ride', rideSchema);

app.use(cors());
app.use(bodyParser.json());
const { Web3 } = require('web3');

const web3 = new Web3('http://127.0.0.1:8545');


// Register endpoint
app.post('/register', async (req, res) => {
  try {
    const { username, email, contact, currentLocation, userImage, userType } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).send({ message: 'User with this email already exists' });
    }


     const accounts = await web3.eth.getAccounts();
     const addressIndex = await User.countDocuments() % accounts.length;
     const etheriumAddress = accounts[addressIndex];

     const newUser = new User({ 
        username, 
        email, 
        contact, 
        currentLocation, 
        userImage, 
        etheriumAddress, 
        userType, 
      });

      await newUser.save();

    res.send({ message: 'User registered successfully', user: newUser });
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).send({ message: 'Error registering user' });
  }
});

// Login endpoint
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email, password });
    if (user) {
      res.send({ message: 'Login successful', user });
    } else {
      res.status(401).send({ message: 'Invalid email or password. Please try again.' });
    }
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).send({ message: 'Error logging in' });
  }
});



// Endpoint to fetch ride details by ID
app.get('/rides/:rideId', async (req, res) => {
  try {
    const rideId = req.params.rideId;
    console.log(rideId)
    const ride = await Ride.findById(rideId);
    if (!ride) {
      return res.status(404).json({ message: 'Ride not found' });
    }
    res.json({ ride });
  } catch (error) {
    console.error('Error fetching ride details:', error);
    res.status(500).json({ error: 'Failed to fetch ride details' });
  }
});

  // Route to fetch user details by ID
app.get('/user/:userId', async (req, res) => {
    try {
      const userId = req.params.userId;
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      res.json({ user });
    } catch (error) {
      console.error('Error fetching user details:', error);
      res.status(500).json({ error: 'Failed to fetch user details' });
    }
  });

  
// Route to fetch ride history by user ID
app.get('/ride-history/user/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const rideHistory = await Ride.find({ user_id: userId });
    res.json({ rideHistory });
  } catch (error) {
    console.error('Error fetching ride history:', error);
    res.status(500).json({ error: 'Failed to fetch ride history' });
  }
});

// Route to fetch ride history by driver ID
app.get('/ride-history/driver/:driverId', async (req, res) => {
  try {
    const driverId = req.params.driverId;
    const rideHistory = await Ride.find({ driver_id: driverId });
    res.json({ rideHistory });
  } catch (error) {
    console.error('Error fetching ride history:', error);
    res.status(500).json({ error: 'Failed to fetch ride history' });
  }
});


// Update ride status endpoint
app.put('/update-ride-status/:rideId', async (req, res) => {
  try {
    const rideId = req.params.rideId;
    const { ride_status } = req.body;
    const updatedRide = await Ride.findByIdAndUpdate(rideId, { ride_status }, { new: true });

    if (!updatedRide) {
      return res.status(404).json({ message: 'Ride not found' });
    }

    res.json({ message: 'Ride status updated successfully', ride: updatedRide });
  } catch (error) {
    console.error('Error updating ride status:', error);
    res.status(500).json({ message: 'Error updating ride status' });
  }
});


// Define your route for fetching requested rides
app.get('/requested-rides', async (req, res) => {
    try {
      // Retrieve requested rides from the database
      const requestedRides = await Ride.find({ ride_status: 'requested' }).populate('user_id');
      
      // Send the requested rides as a response
      res.json({ requestedRides });
    } catch (error) {
      console.error('Error fetching requested rides:', error);
      res.status(500).json({ message: 'Error fetching requested rides' });
    }
  });

  

// Request ride endpoint
app.post('/request-ride', async (req, res) => {
    try {
      const { userId, source, destination, fare } = req.body; // Destructure userId, source, destination, and fare from request body
      const ride = new Ride({
        user_id: userId, // Use userId to populate user_id field
        ride_date: new Date(),
        ride_location: `${source} to ${destination}`,
        ride_fare: fare,
        time: new Date().toLocaleTimeString(),
        ride_status: 'requested'
      });
      await ride.save();
      res.send({ success: true, message: 'Ride requested successfully' });
    } catch (error) {
      console.error('Error requesting ride:', error);
      res.status(500).send({ success: false, message: 'Error requesting ride' });
    }
  });
  
  // Accept ride endpoint
app.post('/accept-ride', async (req, res) => {
  try {
    const { rideId, driverId } = req.body; 

    // Update ride status to 'accepted' and set driver_id to driverId
    await Ride.findByIdAndUpdate(rideId, { ride_status: 'accepted', driver_id: driverId });

    // After 5 seconds, update the ride status to 'done'
    setTimeout(async () => {
      await Ride.findByIdAndUpdate(rideId, { ride_status: 'done' });
      console.log('Ride status updated to done after 5 seconds');
    }, 5000);

    res.send({ message: 'Ride accepted successfully' });
  } catch (error) {
    console.error('Error accepting ride:', error);
    res.status(500).send({ message: 'Error accepting ride' });
  }
});
// Serve frontend build (React app from backend/public)
app.use(express.static(path.join(__dirname, 'public')));

// Catch-all route: send back React's index.html for any unknown paths
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
