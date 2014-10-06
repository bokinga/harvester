# harvester

![harvester - npm](https://nodei.co/npm/harvester.png?downloads=true&stars=true)

## What is harvester?

**harvester** is a node module that enables you to monitor the performance metrics of your node applications in realtime over WebSockets. With just a few lines of code, you can start sending valuable data to your [harvester-server](https://npmjs.org/package/harvester-server).

## Getting Started

The first thing you want to do is install the module into your node application by performing this command:

`npm install harvester --save`.

Once you've done that, you can add **harvester** to your application by adding the following code to the top of your application's main script:

`const harvester = require('harvester')(); // must be at top of file`

That's it! It's *super* easy.

Please refer to the [Supported Modules](https://github.com/carldanley/harvester#supported-modules) section for more information on how harvester tracks data for your node application.

## Supported Modules

**harvester** gives you the tools to [track your own custom data](https://github.com/carldanley/harvester#tracking-custom-data) but if you're using one of the supported modules (listed below) in your node application, **harvester** will automatically track data for you; thus, minimizing extra work.

1. [knex.js](https://www.npmjs.org/package/knex)
  * supports all database dialects
  * reports data for successful queries (`db.query`)
  * reports data for failed queries (`db.error`)
1. [express.js](https://www.npmjs.org/package/express)
  * reports data for web transactions (`web.request`)

## Tracking Custom Data

**harvester** makes it easy for you to track your own performance metrics. You can make use of the following API methods to start tracking your own data now.

1. `harvester.startHarvesting(name, interval, callback)` - schedules a harvest to occur every `interval` of time.
1. `harvester.stopHarvesting(name)` - stops the previously scheduled harvest routine from occurring again.
1. `harvester.harvest(name, data)` - sends harvest data to the connected transport (to be delivered to your server)

## Dependencies

In order to capture the data that **harvester** makes available, you'll need to install your own [harvester-server](https://npmjs.org/package/harvester-server) (or a custom [socket.io](https://www.npmjs.org/package/socket.io) server).

Currently, the list of supported WebSocket events covers:

1. `web.request`
1. `db.query`
1. `db.error`
1. `environment`
1. `process.info`

## License

Please see the [full license](https://github.com/carldanley/harvester/blob/master/LICENSE) for details.
