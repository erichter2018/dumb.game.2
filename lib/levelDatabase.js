/**
 * levelDatabase.js
 * Complete database of all stages and their levels with position information
 * Extracted from levels.html - contains 60 stages, each with 7 levels
 * 
 * Note: The first level of each stage has a city name but is renamed to "Level 1" in our system
 * All other levels keep their original restaurant names
 */

const LEVEL_DATABASE = {
    // Cities 1-10
    "San Francisco": {
        stageNumber: 1,
        levels: [
            { position: 1, name: "Level 1", originalName: "Lemonade Stand" },
            { position: 2, name: "Food Stand" },
            { position: 3, name: "Food Truck" },
            { position: 4, name: "Cafe" },
            { position: 5, name: "Fast Food" },
            { position: 6, name: "Drive Thru" },
            { position: 7, name: "Restaurant" }
        ]
    },
    "New York": {
        stageNumber: 2,
        levels: [
            { position: 1, name: "Level 1", originalName: "Hot Dog Stand" },
            { position: 2, name: "News Stand" },
            { position: 3, name: "Coffee Truck" },
            { position: 4, name: "Pizzeria" },
            { position: 5, name: "N/A" },
            { position: 6, name: "Coffee House" },
            { position: 7, name: "Diner" }
        ]
    },
    "Miami": {
        stageNumber: 3,
        levels: [
            { position: 1, name: "Level 1", originalName: "Ice Cream Stand" },
            { position: 2, name: "Taco Stand" },
            { position: 3, name: "Ice Cream Truck" },
            { position: 4, name: "Mocktail Bar" },
            { position: 5, name: "Joghurt House" },
            { position: 6, name: "Tapas Bar" },
            { position: 7, name: "Big Drive Thru" }
        ]
    },
    "Paris": {
        stageNumber: 4,
        levels: [
            { position: 1, name: "Level 1", originalName: "Ice Cream Stand" },
            { position: 2, name: "Food Stand" },
            { position: 3, name: "Coffee Truck" },
            { position: 4, name: "Cafe" },
            { position: 5, name: "Sushi Bar" },
            { position: 6, name: "Drive Thru" },
            { position: 7, name: "Seafood Restaurant" }
        ]
    },
    "London": {
        stageNumber: 5,
        levels: [
            { position: 1, name: "Level 1", originalName: "Street Nuts" },
            { position: 2, name: "Floral Stand" },
            { position: 3, name: "Ice Cream Truck" },
            { position: 4, name: "Cheese Shop" },
            { position: 5, name: "Pizzeria" },
            { position: 6, name: "Fish and Chips Shop" },
            { position: 7, name: "Big Drive Thru" }
        ]
    },
    "Tokyo": {
        stageNumber: 6,
        levels: [
            { position: 1, name: "Level 1", originalName: "Dango Stand" },
            { position: 2, name: "Big Ice Cream Stand" },
            { position: 3, name: "Ramen Truck" },
            { position: 4, name: "Fast Food" },
            { position: 5, name: "Sushi Bar" },
            { position: 6, name: "Mocktail Bar" },
            { position: 7, name: "Restaurant" }
        ]
    },
    "Venice": {
        stageNumber: 7,
        levels: [
            { position: 1, name: "Level 1", originalName: "Ice Cream Stand" },
            { position: 2, name: "Waffle Stand" },
            { position: 3, name: "Coffee Truck" },
            { position: 4, name: "Cafe Napolita" },
            { position: 5, name: "Pizzeria" },
            { position: 6, name: "Dessert Co" },
            { position: 7, name: "Italiano" }
        ]
    },
    "Beirut": {
        stageNumber: 8,
        levels: [
            { position: 1, name: "Level 1", originalName: "Street Nuts" },
            { position: 2, name: "Floral Stand" },
            { position: 3, name: "Ice Cream Truck" },
            { position: 4, name: "Baklava Shop" },
            { position: 5, name: "Kebab Shop" },
            { position: 6, name: "Coffee House" },
            { position: 7, name: "Mezze Bar" }
        ]
    },
    "Berlin": {
        stageNumber: 9,
        levels: [
            { position: 1, name: "Level 1", originalName: "Ice Cream Stand" },
            { position: 2, name: "Curry Wurst Stand" },
            { position: 3, name: "Food Truck" },
            { position: 4, name: "Cafe" },
            { position: 5, name: "Kebab Shop" },
            { position: 6, name: "Sushi Bar" },
            { position: 7, name: "Apple Juice Bar" }
        ]
    },
    "Oslo": {
        stageNumber: 10,
        levels: [
            { position: 1, name: "Level 1", originalName: "Street Nuts" },
            { position: 2, name: "Curry Wurst Stand" },
            { position: 3, name: "Coffee Truck" },
            { position: 4, name: "Cheese Shop" },
            { position: 5, name: "Lobster House" },
            { position: 6, name: "Fish and Chips Shop" },
            { position: 7, name: "Restaurant" }
        ]
    },

    // Cities 11-20
    "Rome": {
        stageNumber: 11,
        levels: [
            { position: 1, name: "Level 1", originalName: "Ice Cream Stand" },
            { position: 2, name: "Waffle Stand" },
            { position: 3, name: "Coffee Truck" },
            { position: 4, name: "Dessert Co" },
            { position: 5, name: "Pizzeria" },
            { position: 6, name: "Cafe Napolita" },
            { position: 7, name: "Italiano" }
        ]
    },
    "Warsaw": {
        stageNumber: 12,
        levels: [
            { position: 1, name: "Level 1", originalName: "Street Nuts" },
            { position: 2, name: "Curry Wurst Stand" },
            { position: 3, name: "Coffee Truck" },
            { position: 4, name: "Cheese Shop" },
            { position: 5, name: "Dumpling Hut" },
            { position: 6, name: "Cafe" },
            { position: 7, name: "The Fresh Kitchen" }
        ]
    },
    "Johannesburg": {
        stageNumber: 13,
        levels: [
            { position: 1, name: "Level 1", originalName: "Dango Stand" },
            { position: 2, name: "Floral Stand" },
            { position: 3, name: "Ice Cream Truck" },
            { position: 4, name: "Fast Food" },
            { position: 5, name: "Mocktail Bar" },
            { position: 6, name: "Burrito King" },
            { position: 7, name: "Drive Thru Take Out" }
        ]
    },
    "Stockholm": {
        stageNumber: 14,
        levels: [
            { position: 1, name: "Level 1", originalName: "Street Nuts" },
            { position: 2, name: "Curry Wurst Stand" },
            { position: 3, name: "Coffee Truck" },
            { position: 4, name: "Coffee House" },
            { position: 5, name: "Lobster House" },
            { position: 6, name: "Joghurt House" },
            { position: 7, name: "The Fresh Kitchen" }
        ]
    },
    "Mexico City": {
        stageNumber: 15,
        levels: [
            { position: 1, name: "Level 1", originalName: "Ice Cream Stand" },
            { position: 2, name: "Taco Stand" },
            { position: 3, name: "Food Truck" },
            { position: 4, name: "Tapas Bar" },
            { position: 5, name: "Burrito King" },
            { position: 6, name: "Mocktail Bar" },
            { position: 7, name: "Drive Thru Take Out" }
        ]
    },
    "Portland": {
        stageNumber: 16,
        levels: [
            { position: 1, name: "Level 1", originalName: "Hot Dog Stand" },
            { position: 2, name: "Food Stand" },
            { position: 3, name: "Ramen Truck" },
            { position: 4, name: "Cafe" },
            { position: 5, name: "Joghurt House" },
            { position: 6, name: "Lobster House" },
            { position: 7, name: "Diner" }
        ]
    },
    "Toronto": {
        stageNumber: 17,
        levels: [
            { position: 1, name: "Level 1", originalName: "Ice Cream Stand" },
            { position: 2, name: "News Stand" },
            { position: 3, name: "Food Truck" },
            { position: 4, name: "Fast Food" },
            { position: 5, name: "N/A" },
            { position: 6, name: "Mocktail Bar" },
            { position: 7, name: "Drive Thru Take Out" }
        ]
    },
    "Sydney": {
        stageNumber: 18,
        levels: [
            { position: 1, name: "Level 1", originalName: "Lemonade Stand" },
            { position: 2, name: "Big Ice Cream Stand" },
            { position: 3, name: "Ice Cream Truck" },
            { position: 4, name: "Fish and Chips Shop" },
            { position: 5, name: "Kebab Shop" },
            { position: 6, name: "Cafe Napolita" },
            { position: 7, name: "Seafood Restaurant" }
        ]
    },
    "Lyon": {
        stageNumber: 19,
        levels: [
            { position: 1, name: "Level 1", originalName: "Street Nuts" },
            { position: 2, name: "Waffle Stand" },
            { position: 3, name: "Coffee Truck" },
            { position: 4, name: "Dessert Co" },
            { position: 5, name: "Cheese Shop" },
            { position: 6, name: "Drive Thru" },
            { position: 7, name: "The Fresh Kitchen" }
        ]
    },
    "Glasgow": {
        stageNumber: 20,
        levels: [
            { position: 1, name: "Level 1", originalName: "Lemonade Stand" },
            { position: 2, name: "Floral Stand" },
            { position: 3, name: "Food Truck" },
            { position: 4, name: "Dumpling Hut" },
            { position: 5, name: "Fish and Chips Shop" },
            { position: 6, name: "Burrito King" },
            { position: 7, name: "Big Drive Thru" }
        ]
    },

    // Cities 21-30
    "Beijing": {
        stageNumber: 21,
        levels: [
            { position: 1, name: "Level 1", originalName: "Dango Stand" },
            { position: 2, name: "News Stand" },
            { position: 3, name: "Ramen Truck" },
            { position: 4, name: "Pizzeria" },
            { position: 5, name: "Sushi Bar" },
            { position: 6, name: "Dumpling Hut" },
            { position: 7, name: "Restaurant" }
        ]
    },
    "Bruges": {
        stageNumber: 22,
        levels: [
            { position: 1, name: "Level 1", originalName: "Lemonade Stand" },
            { position: 2, name: "Big Ice Cream Stand" },
            { position: 3, name: "Coffee Truck" },
            { position: 4, name: "Cafe Napolita" },
            { position: 5, name: "Baklava Shop" },
            { position: 6, name: "Tapas Bar" },
            { position: 7, name: "Italiano" }
        ]
    },
    "Istanbul": {
        stageNumber: 23,
        levels: [
            { position: 1, name: "Level 1", originalName: "Ice Cream Stand" },
            { position: 2, name: "Floral Stand" },
            { position: 3, name: "Ice Cream Truck" },
            { position: 4, name: "Kebab Shop" },
            { position: 5, name: "Coffee House" },
            { position: 6, name: "Baklava Shop" },
            { position: 7, name: "Mezze Bar" }
        ]
    },
    "Hamburg": {
        stageNumber: 24,
        levels: [
            { position: 1, name: "Level 1", originalName: "Street Nuts" },
            { position: 2, name: "Curry Wurst Stand" },
            { position: 3, name: "Food Truck" },
            { position: 4, name: "Cafe" },
            { position: 5, name: "Kebab Shop" },
            { position: 6, name: "Sushi Bar" },
            { position: 7, name: "Apple Juice Bar" }
        ]
    },
    "Zurich": {
        stageNumber: 25,
        levels: [
            { position: 1, name: "Level 1", originalName: "Hot Dog Stand" },
            { position: 2, name: "Curry Wurst Stand" },
            { position: 3, name: "Ramen Truck" },
            { position: 4, name: "Cheese Shop" },
            { position: 5, name: "Lobster House" },
            { position: 6, name: "Fish and Chips Shop" },
            { position: 7, name: "Restaurant" }
        ]
    },
    "Milan": {
        stageNumber: 26,
        levels: [
            { position: 1, name: "Level 1", originalName: "Street Nuts" },
            { position: 2, name: "Floral Stand" },
            { position: 3, name: "Ice Cream Truck" },
            { position: 4, name: "Dessert Co" },
            { position: 5, name: "Pizzeria" },
            { position: 6, name: "Cafe Napolita" },
            { position: 7, name: "Italiano" }
        ]
    },
    "Budapest": {
        stageNumber: 27,
        levels: [
            { position: 1, name: "Level 1", originalName: "Dango Stand" },
            { position: 2, name: "Waffle Stand" },
            { position: 3, name: "Coffee Truck" },
            { position: 4, name: "Fast Food" },
            { position: 5, name: "Coffee House" },
            { position: 6, name: "Drive Thru" },
            { position: 7, name: "Mezze Bar" }
        ]
    },
    "Nairobi": {
        stageNumber: 28,
        levels: [
            { position: 1, name: "Level 1", originalName: "Dango Stand" },
            { position: 2, name: "Food Stand" },
            { position: 3, name: "Food Truck" },
            { position: 4, name: "Joghurt House" },
            { position: 5, name: "Tapas Bar" },
            { position: 6, name: "Mocktail Bar" },
            { position: 7, name: "Big Drive Thru" }
        ]
    },
    "Helsinki": {
        stageNumber: 29,
        levels: [
            { position: 1, name: "Level 1", originalName: "Hot Dog Stand" },
            { position: 2, name: "News Stand" },
            { position: 3, name: "Ice Cream Truck" },
            { position: 4, name: "Cafe" },
            { position: 5, name: "Cheese Shop" },
            { position: 6, name: "Dessert Co" },
            { position: 7, name: "The Fresh Kitchen" }
        ]
    },
    "Sao Paulo": {
        stageNumber: 30,
        levels: [
            { position: 1, name: "Level 1", originalName: "Ice Cream Stand" },
            { position: 2, name: "Taco Stand" },
            { position: 3, name: "Food Truck" },
            { position: 4, name: "Tapas Bar" },
            { position: 5, name: "Burrito King" },
            { position: 6, name: "Mocktail Bar" },
            { position: 7, name: "Drive Thru Take Out" }
        ]
    },

    // Cities 31-40
    "Seattle": {
        stageNumber: 31,
        levels: [
            { position: 1, name: "Level 1", originalName: "Lemonade Stand" },
            { position: 2, name: "Food Stand" },
            { position: 3, name: "Food Truck" },
            { position: 4, name: "Cafe" },
            { position: 5, name: "Fast Food" },
            { position: 6, name: "Drive Thru" },
            { position: 7, name: "Restaurant" }
        ]
    },
    "San Diego": {
        stageNumber: 32,
        levels: [
            { position: 1, name: "Level 1", originalName: "Hot Dog Stand" },
            { position: 2, name: "News Stand" },
            { position: 3, name: "Coffee Truck" },
            { position: 4, name: "Pizzeria" },
            { position: 5, name: "N/A" },
            { position: 6, name: "Coffee House" },
            { position: 7, name: "Diner" }
        ]
    },
    "Santa Monica": {
        stageNumber: 33,
        levels: [
            { position: 1, name: "Level 1", originalName: "Ice Cream Stand" },
            { position: 2, name: "Taco Stand" },
            { position: 3, name: "Ice Cream Truck" },
            { position: 4, name: "Mocktail Bar" },
            { position: 5, name: "Joghurt House" },
            { position: 6, name: "Tapas Bar" },
            { position: 7, name: "Big Drive Thru" }
        ]
    },
    "Brussels": {
        stageNumber: 34,
        levels: [
            { position: 1, name: "Level 1", originalName: "Ice Cream Stand" },
            { position: 2, name: "Food Stand" },
            { position: 3, name: "Coffee Truck" },
            { position: 4, name: "Cafe" },
            { position: 5, name: "Sushi Bar" },
            { position: 6, name: "Drive Thru" },
            { position: 7, name: "Seafood Restaurant" }
        ]
    },
    "Luxembourg": {
        stageNumber: 35,
        levels: [
            { position: 1, name: "Level 1", originalName: "Street Nuts" },
            { position: 2, name: "Floral Stand" },
            { position: 3, name: "Ice Cream Truck" },
            { position: 4, name: "Cheese Shop" },
            { position: 5, name: "Pizzeria" },
            { position: 6, name: "Fish and Chips Shop" },
            { position: 7, name: "Big Drive Thru" }
        ]
    },
    "Hong Kong": {
        stageNumber: 36,
        levels: [
            { position: 1, name: "Level 1", originalName: "Dango Stand" },
            { position: 2, name: "Big Ice Cream Stand" },
            { position: 3, name: "Ramen Truck" },
            { position: 4, name: "Fast Food" },
            { position: 5, name: "Sushi Bar" },
            { position: 6, name: "Mocktail Bar" },
            { position: 7, name: "Restaurant" }
        ]
    },
    "Treviso": {
        stageNumber: 37,
        levels: [
            { position: 1, name: "Level 1", originalName: "Ice Cream Stand" },
            { position: 2, name: "Waffle Stand" },
            { position: 3, name: "Coffee Truck" },
            { position: 4, name: "Cafe Napolita" },
            { position: 5, name: "Pizzeria" },
            { position: 6, name: "Dessert Co" },
            { position: 7, name: "Italiano" }
        ]
    },
    "Marrakesh": {
        stageNumber: 38,
        levels: [
            { position: 1, name: "Level 1", originalName: "Street Nuts" },
            { position: 2, name: "Floral Stand" },
            { position: 3, name: "Ice Cream Truck" },
            { position: 4, name: "Baklava Shop" },
            { position: 5, name: "Kebab Shop" },
            { position: 6, name: "Coffee House" },
            { position: 7, name: "Mezze Bar" }
        ]
    },
    "Cologne": {
        stageNumber: 39,
        levels: [
            { position: 1, name: "Level 1", originalName: "Ice Cream Stand" },
            { position: 2, name: "Curry Wurst Stand" },
            { position: 3, name: "Food Truck" },
            { position: 4, name: "Cafe" },
            { position: 5, name: "Kebab Shop" },
            { position: 6, name: "Sushi Bar" },
            { position: 7, name: "Apple Juice Bar" }
        ]
    },
    "Tallinn": {
        stageNumber: 40,
        levels: [
            { position: 1, name: "Level 1", originalName: "Street Nuts" },
            { position: 2, name: "Curry Wurst Stand" },
            { position: 3, name: "Coffee Truck" },
            { position: 4, name: "Cheese Shop" },
            { position: 5, name: "Lobster House" },
            { position: 6, name: "Fish and Chips Shop" },
            { position: 7, name: "Restaurant" }
        ]
    },

    // Cities 41-50
    "Florence": {
        stageNumber: 41,
        levels: [
            { position: 1, name: "Level 1", originalName: "Ice Cream Stand" },
            { position: 2, name: "Waffle Stand" },
            { position: 3, name: "Coffee Truck" },
            { position: 4, name: "Dessert Co" },
            { position: 5, name: "Pizzeria" },
            { position: 6, name: "Cafe Napolita" },
            { position: 7, name: "Italiano" }
        ]
    },
    "Prague": {
        stageNumber: 42,
        levels: [
            { position: 1, name: "Level 1", originalName: "Street Nuts" },
            { position: 2, name: "Curry Wurst Stand" },
            { position: 3, name: "Coffee Truck" },
            { position: 4, name: "Cheese Shop" },
            { position: 5, name: "Dumpling Hut" },
            { position: 6, name: "Cafe" },
            { position: 7, name: "The Fresh Kitchen" }
        ]
    },
    "Cape Town": {
        stageNumber: 43,
        levels: [
            { position: 1, name: "Level 1", originalName: "Dango Stand" },
            { position: 2, name: "Floral Stand" },
            { position: 3, name: "Ice Cream Truck" },
            { position: 4, name: "Fast Food" },
            { position: 5, name: "Mocktail Bar" },
            { position: 6, name: "Burrito King" },
            { position: 7, name: "Drive Thru Take Out" }
        ]
    },
    "Copenhagen": {
        stageNumber: 44,
        levels: [
            { position: 1, name: "Level 1", originalName: "Street Nuts" },
            { position: 2, name: "Curry Wurst Stand" },
            { position: 3, name: "Coffee Truck" },
            { position: 4, name: "Coffee House" },
            { position: 5, name: "Lobster House" },
            { position: 6, name: "Joghurt House" },
            { position: 7, name: "The Fresh Kitchen" }
        ]
    },
    "Lima": {
        stageNumber: 45,
        levels: [
            { position: 1, name: "Level 1", originalName: "Ice Cream Stand" },
            { position: 2, name: "Taco Stand" },
            { position: 3, name: "Food Truck" },
            { position: 4, name: "Tapas Bar" },
            { position: 5, name: "Burrito King" },
            { position: 6, name: "Mocktail Bar" },
            { position: 7, name: "Drive Thru Take Out" }
        ]
    },
    "Los Angeles": {
        stageNumber: 46,
        levels: [
            { position: 1, name: "Level 1", originalName: "Hot Dog Stand" },
            { position: 2, name: "Food Stand" },
            { position: 3, name: "Ramen Truck" },
            { position: 4, name: "Cafe" },
            { position: 5, name: "Joghurt House" },
            { position: 6, name: "Lobster House" },
            { position: 7, name: "Diner" }
        ]
    },
    "Pittsburgh": {
        stageNumber: 47,
        levels: [
            { position: 1, name: "Level 1", originalName: "Ice Cream Stand" },
            { position: 2, name: "News Stand" },
            { position: 3, name: "Food Truck" },
            { position: 4, name: "Fast Food" },
            { position: 5, name: "N/A" },
            { position: 6, name: "Mocktail Bar" },
            { position: 7, name: "Drive Thru Take Out" }
        ]
    },
    "Nassau": {
        stageNumber: 48,
        levels: [
            { position: 1, name: "Level 1", originalName: "Lemonade Stand" },
            { position: 2, name: "Big Ice Cream Stand" },
            { position: 3, name: "Ice Cream Truck" },
            { position: 4, name: "Fish and Chips Shop" },
            { position: 5, name: "Kebab Shop" },
            { position: 6, name: "Cafe Napolita" },
            { position: 7, name: "Seafood Restaurant" }
        ]
    },
    "Madrid": {
        stageNumber: 49,
        levels: [
            { position: 1, name: "Level 1", originalName: "Street Nuts" },
            { position: 2, name: "Waffle Stand" },
            { position: 3, name: "Coffee Truck" },
            { position: 4, name: "Dessert Co" },
            { position: 5, name: "Cheese Shop" },
            { position: 6, name: "Drive Thru" },
            { position: 7, name: "The Fresh Kitchen" }
        ]
    },
    "Amsterdam": {
        stageNumber: 50,
        levels: [
            { position: 1, name: "Level 1", originalName: "Lemonade Stand" },
            { position: 2, name: "Floral Stand" },
            { position: 3, name: "Food Truck" },
            { position: 4, name: "Dumpling Hut" },
            { position: 5, name: "Fish and Chips Shop" },
            { position: 6, name: "Burrito King" },
            { position: 7, name: "Big Drive Thru" }
        ]
    },

    // Cities 51-60
    "Seoul": {
        stageNumber: 51,
        levels: [
            { position: 1, name: "Level 1", originalName: "Dango Stand" },
            { position: 2, name: "News Stand" },
            { position: 3, name: "Ramen Truck" },
            { position: 4, name: "Pizzeria" },
            { position: 5, name: "Sushi Bar" },
            { position: 6, name: "Dumpling Hut" },
            { position: 7, name: "Restaurant" }
        ]
    },
    "Birmingham": {
        stageNumber: 52,
        levels: [
            { position: 1, name: "Level 1", originalName: "Lemonade Stand" },
            { position: 2, name: "Big Ice Cream Stand" },
            { position: 3, name: "Coffee Truck" },
            { position: 4, name: "Cafe Napolita" },
            { position: 5, name: "Baklava Shop" },
            { position: 6, name: "Tapas Bar" },
            { position: 7, name: "Italiano" }
        ]
    },
    "Cairo": {
        stageNumber: 53,
        levels: [
            { position: 1, name: "Level 1", originalName: "Ice Cream Stand" },
            { position: 2, name: "Floral Stand" },
            { position: 3, name: "Ice Cream Truck" },
            { position: 4, name: "Kebab Shop" },
            { position: 5, name: "Coffee House" },
            { position: 6, name: "Baklava Shop" },
            { position: 7, name: "Mezze Bar" }
        ]
    },
    "Frankfurt": {
        stageNumber: 54,
        levels: [
            { position: 1, name: "Level 1", originalName: "Street Nuts" },
            { position: 2, name: "Curry Wurst Stand" },
            { position: 3, name: "Food Truck" },
            { position: 4, name: "Cafe" },
            { position: 5, name: "Kebab Shop" },
            { position: 6, name: "Sushi Bar" },
            { position: 7, name: "Apple Juice Bar" }
        ]
    },
    "Quebec": {
        stageNumber: 55,
        levels: [
            { position: 1, name: "Level 1", originalName: "Hot Dog Stand" },
            { position: 2, name: "Curry Wurst Stand" },
            { position: 3, name: "Ramen Truck" },
            { position: 4, name: "Cheese Shop" },
            { position: 5, name: "Lobster House" },
            { position: 6, name: "Fish and Chips Shop" },
            { position: 7, name: "Restaurant" }
        ]
    },
    "Naples": {
        stageNumber: 56,
        levels: [
            { position: 1, name: "Level 1", originalName: "Street Nuts" },
            { position: 2, name: "Floral Stand" },
            { position: 3, name: "Ice Cream Truck" },
            { position: 4, name: "Dessert Co" },
            { position: 5, name: "Pizzeria" },
            { position: 6, name: "Cafe Napolita" },
            { position: 7, name: "Italiano" }
        ]
    },
    "Zagreb": {
        stageNumber: 57,
        levels: [
            { position: 1, name: "Level 1", originalName: "Dango Stand" },
            { position: 2, name: "Waffle Stand" },
            { position: 3, name: "Coffee Truck" },
            { position: 4, name: "Fast Food" },
            { position: 5, name: "Coffee House" },
            { position: 6, name: "Drive Thru" },
            { position: 7, name: "Mezze Bar" }
        ]
    },
    "Pretoria": {
        stageNumber: 58,
        levels: [
            { position: 1, name: "Level 1", originalName: "Dango Stand" },
            { position: 2, name: "Food Stand" },
            { position: 3, name: "Food Truck" },
            { position: 4, name: "Joghurt House" },
            { position: 5, name: "Tapas Bar" },
            { position: 6, name: "Mocktail Bar" },
            { position: 7, name: "Big Drive Thru" }
        ]
    },
    "Gothenburg": {
        stageNumber: 59,
        levels: [
            { position: 1, name: "Level 1", originalName: "Hot Dog Stand" },
            { position: 2, name: "News Stand" },
            { position: 3, name: "Ice Cream Truck" },
            { position: 4, name: "Cafe" },
            { position: 5, name: "Cheese Shop" },
            { position: 6, name: "Dessert Co" },
            { position: 7, name: "The Fresh Kitchen" }
        ]
    },
    "Santiago": {
        stageNumber: 60,
        levels: [
            { position: 1, name: "Level 1", originalName: "Ice Cream Stand" },
            { position: 2, name: "Taco Stand" },
            { position: 3, name: "Food Truck" },
            { position: 4, name: "Tapas Bar" },
            { position: 5, name: "Burrito King" },
            { position: 6, name: "Mocktail Bar" },
            { position: 7, name: "Drive Thru Take Out" }
        ]
    }
};

/**
 * Helper functions to work with the level database
 */

/**
 * Get stage information by city name
 * @param {string} cityName - The city name (case-insensitive)
 * @returns {object|null} Stage object or null if not found
 */
function getStageByCity(cityName) {
    if (!cityName) return null;
    
    // Find matching city (case-insensitive)
    const matchingCity = Object.keys(LEVEL_DATABASE).find(city => 
        city.toLowerCase() === cityName.toLowerCase()
    );
    
    return matchingCity ? LEVEL_DATABASE[matchingCity] : null;
}

/**
 * Get level position within stage by level name
 * @param {string} levelName - The level name to find
 * @param {string} stageName - Optional stage name to narrow search
 * @returns {object|null} Object with {stageName, stageNumber, position, levelInfo} or null
 */
function getLevelPosition(levelName, stageName = null) {
    if (!levelName) return null;
    
    const searchStages = stageName ? [stageName] : Object.keys(LEVEL_DATABASE);
    
    for (const city of searchStages) {
        const stage = LEVEL_DATABASE[city];
        const level = stage.levels.find(l => l.name.toLowerCase() === levelName.toLowerCase());
        
        if (level) {
            return {
                stageName: city,
                stageNumber: stage.stageNumber,
                position: level.position,
                levelInfo: level
            };
        }
    }
    
    return null;
}

/**
 * Get all levels for a specific stage
 * @param {string} cityName - The city name
 * @returns {array|null} Array of level objects or null
 */
function getStageLevels(cityName) {
    const stage = getStageByCity(cityName);
    return stage ? stage.levels : null;
}

/**
 * Check if a level name is the first level of any stage
 * @param {string} levelName - The level name to check
 * @returns {boolean} True if it's a stage start level
 */
function isStageStartLevel(levelName) {
    if (!levelName) return false;
    
    return Object.values(LEVEL_DATABASE).some(stage => 
        stage.levels[0].name.toLowerCase() === levelName.toLowerCase() ||
        stage.levels[0].originalName?.toLowerCase() === levelName.toLowerCase()
    );
}

/**
 * Get the expected next level in a stage
 * @param {string} currentLevelName - Current level name
 * @param {string} stageName - Stage name
 * @returns {object|null} Next level info or null if at end
 */
function getNextLevelInStage(currentLevelName, stageName) {
    const stage = getStageByCity(stageName);
    if (!stage) return null;
    
    const currentIndex = stage.levels.findIndex(l => 
        l.name.toLowerCase() === currentLevelName.toLowerCase()
    );
    
    if (currentIndex === -1 || currentIndex === stage.levels.length - 1) {
        return null; // Not found or at end of stage
    }
    
    return stage.levels[currentIndex + 1];
}

/**
 * Get all stages from the database
 * @returns {object} The complete LEVEL_DATABASE object
 */
function getAllStages() {
    return LEVEL_DATABASE;
}

module.exports = {
    LEVEL_DATABASE,
    getStageByCity,
    getLevelPosition,
    getStageLevels,
    isStageStartLevel,
    getNextLevelInStage,
    getAllStages
};
