import React from 'react';
import axios from 'axios';

function App() {
  const handlePayment = async () => {
    const { data } = await axios.post('/api/create-order', { amount: 49900 });
    const options = {
      key: process.env.REACT_APP_RAZORPAY_KEY_ID,
      amount: data.amount,
      currency: data.currency,
      name: 'Ebookiez Store',
      description: 'Purchase Skincare Ebook',
      order_id: data.id,
      handler: function (response) {
        alert('Payment successful! Payment ID: ' + response.razorpay_payment_id);
      },
      theme: { color: '#fbbf24' }
    };
    const rzp = new window.Razorpay(options);
    rzp.open();
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-yellow-50 text-gray-800">
      <h1 className="text-4xl font-bold mb-6">Welcome to Ebookiez</h1>
      <img src="https://picsum.photos/200/300?skincare" alt="Skincare Ebook" className="rounded-xl mb-4"/>
      <p className="mb-6">Discover our curated skincare eBooks starting at ₹499</p>
      <button onClick={handlePayment} className="bg-yellow-400 px-6 py-3 rounded-lg text-white font-semibold hover:bg-yellow-500">
        Buy Now with Razorpay
      </button>
    </div>
  );
}

export default App;
