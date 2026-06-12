# Djowda DIFP Store

Djowda DIFP Store is a decentralized food discovery web application built on top of the **Djowda Interconnected Food Protocol (DIFP)**. It allows users to discover local food sources, manage inventory, and broadcast needs or donations over the Nostr network without requiring a centralized account.

## Features

-   **Decentralized Identity**: Your identity is a cryptographic keypair (secp256k1) generated and stored locally in your browser. No signup required.
-   **Geo-Aware Discovery**: Find nearby stores, farmers, restaurants, and more based on your location or a specific Cell ID.
-   **Inventory Management**: Easily list products available for sale, set prices, and toggle availability.
-   **Community Broadcasts**:
    -   **Ask List**: Broadcast products you are looking for.
    -   **Donation List**: Broadcast products you want to donate to the community.
-   **Real-time Updates**: Status and listings are published as Nostr events (Kind 30420 for Presence, Kind 30421 for Catalogs).
-   **Thematic Avatars**: Automatic thematic avatar assignment based on your component type (Store, Farmer, Restaurant, etc.), preloaded from the `@djowda/difp` package.

## How it Works

The application uses the `@djowda/difp` library to interact with the DIFP protocol on Nostr.

### DIFP Protocol Implementation

-   **Presence (Kind 30420)**: Published when you join or update your profile. Includes metadata like name, phone, component type, and working hours.
-   **Catalogs (Kind 30421)**: Published when you update your inventory, ask list, or donation list. These are tagged with your pubkey and the list type (`-l` for listings, `-a` for asks, `-d` for donations).
-   **Grid System**: The protocol uses a cell-based grid system (500m x 500m cells) to enable efficient geo-spatial queries over Nostr relays.

## Getting Started

1.  **Open the App**: Simply open `index.html` in a modern web browser.
2.  **Join the Network**: Enter your store or farm name, optional phone number, and location. Select your component type.
3.  **Manage Your Profile**: Use the "Edit" button to update your information.
4.  **List Products**: Go to the "Inventory" tab, click on a product, set its price and availability, and confirm.
5.  **Discover Others**: Go to the "Discover" tab to search for other DIFP components in your area.

## Technical Details

-   **Frontend**: Vanilla JavaScript, HTML5, and CSS3.
-   **Protocol SDK**: `@djowda/difp` (available on npm).
-   **Nostr Communication**: Direct WebSocket connection to Nostr relays (defaults to `wss://relay.damus.io`).
-   **Assets**: Avatars are served from the `@djowda/difp` package assets.

## License

This project is licensed under the MIT License.
