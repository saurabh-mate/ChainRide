const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema(
  {
    address: { type: String, required: true, trim: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  { _id: false }
);

const bookingSchema = new mongoose.Schema(
  {
    passengerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    seatsBooked: { type: Number, min: 1, required: true },
    pickupPoint: {
      type: locationSchema,
      required: true,
    },
    paymentMethod: {
      type: String,
      enum: ['online', 'cash'],
      default: 'cash',
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid'],
      default: 'pending',
    },
    totalPrice: { type: Number, min: 0, required: true },
    status: {
      type: String,
      enum: ['booked', 'completed', 'cancelled'],
      default: 'booked',
    },
    ratedByPassenger: { type: Boolean, default: false },
    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const offeredRideSchema = new mongoose.Schema(
  {
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    fromLocation: {
      type: locationSchema,
      required: true,
    },
    toLocation: {
      type: locationSchema,
      required: true,
    },
    departureDateTime: {
      type: Date,
      required: true,
      index: true,
    },
    totalSeats: { type: Number, min: 1, required: true },
    seatsAvailable: { type: Number, min: 0, required: true },
    seatsBooked: { type: Number, min: 0, default: 0 },
    pricePerSeat: { type: Number, min: 1, required: true },
    vehicleType:   { type: String, enum: ['car', 'bike', 'auto', 'ev'], default: 'car' },
    vehicleMake:   { type: String, default: '', trim: true },
    vehicleModel:  { type: String, default: '', trim: true },
    vehicleColor:  { type: String, default: '', trim: true },
    vehiclePlate:  { type: String, default: '', trim: true },
    driverQrCode: { type: String, default: null, trim: true },
    status: {
      type: String,
      enum: ['active', 'completed', 'cancelled'],
      default: 'active',
      index: true,
    },
    bookings: {
      type: [bookingSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

offeredRideSchema.virtual('driverId').get(function driverId() {
  return this.driver;
});

offeredRideSchema.virtual('dateTime').get(function dateTime() {
  return this.departureDateTime;
});

offeredRideSchema.virtual('passengersBooked').get(function passengersBooked() {
  return this.bookings;
});

module.exports = mongoose.model('OfferedRide', offeredRideSchema);
