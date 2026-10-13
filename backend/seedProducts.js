
const path = require('path');

require('dotenv').config({
  path: path.join(__dirname, '.env'),
});

const mongoose = require('mongoose');
const Product = require('./models/Product');

const products = [
  {
    name: 'Forbidden',
    slug: 'forbidden',
    shortDescription: '',
    description: '',
    price: 499,
    image: '/products/forbidden-transparent.png',
    images: ['/products/forbidden-transparent.png'],
    isActive: true,
  },
  {
    name: 'Frozen Rose',
    slug: 'frozen-rose',
    shortDescription: '',
    description: '',
    price: 499,
    image: '/products/frozen-rose-transparent.png',
    images: ['/products/frozen-rose-transparent.png'],
    isActive: true,
  },
];

async function seedProducts() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is missing from backend/.env');
  }

  await mongoose.connect(process.env.MONGODB_URI);

  console.log('✅ Connected to MongoDB');

  for (const product of products) {
    await Product.updateOne(
      { slug: product.slug },
      {
        $set: product,
        $setOnInsert: { stock: 0 },
      },
      { upsert: true }
    );
  }

  console.log('✅ VELSHE products seeded successfully');
  console.log('Products processed:', products.length);
}

seedProducts()
  .catch((error) => {
    console.error('❌ Seeding failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
