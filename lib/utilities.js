// dependencies
const os = require('os');

/**
 * Gets an array of IP addresses for the IPv4 network interface.
 * 
 * @return {Array} An array containing strings where each value is an IP address
 */
module.exports.getIPAddresses = function _getIPAddresses() {
  var interfaces = os.networkInterfaces();
  var addresses = [];

  Object.keys(interfaces).forEach(function iterateInterfaces(name) {
    Object.keys(interfaces[name]).forEach(function iterateEntries(property) {
      var address = interfaces[name][property];
      if (address.family === 'IPv4' && !address.internal) {
        addresses.push(address.address);
      }
    });
  });

  return addresses;
};
