/**
 * Mock Booking.com VCC Webhook Payload (POST-VGS Simulation)
 * This mimics what VGS Proxy sends to our API after tokenizing the raw Booking.com payload.
 * Use with: POST /api/external/channel/vgs-simulator/booking.com/bookings
 */

export const mockBookingComVCCPayload = {
  reservation: {
    reservation_number: "BK-TEST-20260915-001",
    confirmation_number: "CONF-123456789",
    id: "123456789",
    status: "confirmed",
    arrival_date: "2026-10-15",
    departure_date: "2026-10-18",
    adults: 2,
    children: 0,
    guest: {
      name: "Ahmed Al-Mansouri",
      email: "ahmed.mansouri@example.com",
      phone: "+218911234567",
    },
    room_type_id: "DBL-STD",
    rate_plan_id: "RATE-FLEX-2026",
    payment: {
      // These will be replaced by VGS Simulator with tokens
      card_number: "4111111111111111",
      expiry_date: "12/2026",
      cvv: "123",
      holder_name: "BOOKING.COM GUEST",
      amount: 900,
      currency: "EUR",
      virtual_card: true,
    },
    rooms: [
      { room_type_id: "DBL-STD", nightly_rate: 300 }
    ],
  },
  hotel_id: "default-hotel",
};

/**
 * Mock Expedia VCC Webhook Payload (POST-VGS Simulation)
 * Use with: POST /api/external/channel/vgs-simulator/expedia/bookings
 */

export const mockExpediaVCCPayload = {
  itinerary: {
    itinerary_id: "EXP-TEST-987654321",
    confirmation_number: "EXP-CONF-987654",
    itineraryId: "987654321",
    status: "booked",
    checkIn: "2026-11-01",
    checkOut: "2026-11-05",
    adults: 2,
    children: 1,
    guestInfo: {
      guestFirstName: "Fatima",
      guestLastName: "Al-Zahra",
      email: "fatima.zahra@example.com",
      phone: "+218922345678",
    },
    room_type_id: "SUP-DLX",
    rate_plan_id: "RATE-NONREF-2026",
    payment: {
      card_number: "4556737586899855",
      expiry_date: "06/2027",
      cvv: "456",
      holder_name: "EXPEDIA GUEST",
      amount: 2400,
      currency: "USD",
    },
  },
  hotel_id: "default-hotel",
};

/**
 * Generic OTA VCC Payload (for Airbnb/Agoda/Trip)
 * Use with: POST /api/external/channel/vgs-simulator/airbnb/bookings
 */

export const mockGenericVCCPayload = {
  external_ref: "AIR-TEST-111222",
  provider: "airbnb",
  guest_name: "Mohamed Ali",
  guest_email: "mohamed.ali@example.com",
  guest_phone: "+218933456789",
  adults: 1,
  children: 0,
  check_in: "2026-12-20",
  check_out: "2026-12-25",
  channel_room_type_id: "AIR-ENTIRE-HOME",
  channel_rate_plan_id: "RATE-STD",
  payment: {
    card_number: "4000056655665556",
    expiry_date: "09/2025",
    cvv: "789",
    holder_name: "AIRBNB GUEST",
    amount: 1500,
    currency: "LYD",
  },
  hotel_id: "default-hotel",
};