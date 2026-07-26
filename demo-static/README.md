# Axtor POS Cloud Frontend

Clean static Vercel deployment root for the Axtor green-glass POS interface.

Deploy this directory directly. No build command is required.

The runtime uses `js/axtor-api.js` and the `axtorAuthToken` local-storage key. The default API is the production Railway endpoint and can be overridden with `axtorApiBaseUrl`.

Dedicated entry pages are included for Retail, Grocery, Pharmacy, Gym, School, Clinic, Restaurant, Hardware, Paint, Furniture, Workshop and Wholesale.
