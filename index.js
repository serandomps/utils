var boot = function (done) {
    $.ajax({
        method: 'GET',
        url: '/apis/v/configs/boot',
        headers: {
            'x-host': 'accounts.serandives.com'
        },
        dataType: 'json',
        success: function (config) {
            done(false, config.value);
        },
        error: function () {
            console.log('error retrieving client id');
            done('error retrieving boot configuration');
        }
    });
};

module.exports.boot = boot;