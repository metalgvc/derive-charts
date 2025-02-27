
const url = 'wss://api.lyra.finance/ws';

const Dashboard = function($){

    let derive = null;
    let portfolio = null;
    let deriveWalletAddr = localStorage.getItem('walletAddr');

    this.init = async function(){

        let autorefresh = localStorage.getItem('autorefresh');
        if (autorefresh !== null) {
            $('input[name="autorefresh"]').prop('checked', !!parseInt(autorefresh));
        }

        initWalletAddr();

        const webSocket = new WebSocket(url);
        derive = await (new Derive(webSocket));

        // let result = await derive.call('currencies', 'public/get_all_currencies', {});
        if (deriveWalletAddr) {
            let auth = await derive.auth(deriveWalletAddr);
            //console.log('auth:', auth);

            await this.refreshPortfolio();
        }

        let self = this;
        $(document)
            .on('change', '.portfolio-rows input.instrument', function(e){
                self.renderChart(portfolio);
            })
            .on('click', '#derive-address', function(e){
                deriveWalletAddr = null;
                initWalletAddr();
            })
            .on('change', 'input[name="autorefresh"]', function(e){
                localStorage.setItem('autorefresh', $(e.currentTarget).is(':checked') ? 1 : 0);
            })
            .on('click', '.minmax', minmax)
            .on('click', '.clear a', function(e){
                $('.portfolio-rows input[type="checkbox"]:checked').prop('checked', false);
                //self.refreshPortfolio();
                self.renderChart(portfolio);
            })
        ;

        setInterval(function(){
            if ($('input[name="autorefresh"]:checked').length > 0) {
                self.refreshPortfolio();
            }
        }, 10 * 1000);
    };

    let initWalletAddr = async function() {
        if (!deriveWalletAddr) {
            let _deriveWalletAddr = prompt('Please enter your derive wallet address:');
            if (_deriveWalletAddr) {
                deriveWalletAddr = _deriveWalletAddr;
                localStorage.setItem('walletAddr', deriveWalletAddr);
                await derive.auth(deriveWalletAddr);
            }
        }

        if (deriveWalletAddr) {
            $('#derive-address').text(deriveWalletAddr ? deriveWalletAddr.slice(0, 5) + '...' + deriveWalletAddr.slice(-3) : '');
        }
    }

    this.refreshPortfolio = async function(){
        portfolio = await derive.portfolio();

        renderPortfolioList(portfolio);
        this.renderChart(portfolio);
    };


    let renderPortfolioList = (result) => {

        // save checked positions to restore
        let _checkedPosTmp = [];
        $('.portfolio-rows input.instrument:checked').each((i, el) => {
            _checkedPosTmp.push($(el).attr('name'));
        });

        //$('.portfolio-rows').html('');
        let html = '';

        for (let subacc of result) {

            for (let positionData of subacc.positions) {
                const position = { ...positionData };
                //position['data'] = JSON.stringify(positionData);

                // default
                position['amount_type'] = '';
                position['opt_exp'] = '';
                position['amount_usd'] = '';

                if (!position['liquidation_price']) {
                    position['liquidation_price'] = '-';
                } else {
                    position['liquidation_price'] = '$'+ position['liquidation_price'];
                }

                // amount_type
                if (position['instrument_type'] === 'perp') {
                    position['amount_type'] = position['instrument_name'].split('-')[0];
                } else if (position['instrument_type'] === 'option') {
                    let iparts = position['instrument_name'].split('-');
                    let itype = iparts[iparts.length - 1];
                    position['amount_type'] = itype === 'C' ? 'Calls' : 'Puts';
                    position['opt_exp'] = formatExpDate(iparts[1]) +' Exp';
                }

                // realized_pnl
                position['realized_pnl'] = parseFloat(position['realized_pnl']) + parseFloat(position['cumulative_funding']);
                if (position['realized_pnl'] === 0) {
                    position['realized_pnl'] = '';
                }
                position['realized_pnl_color'] = position['realized_pnl'] > 0 ? 'green' : 'red';

                // unrealized_pnl_color
                position['unrealized_pnl_color'] = parseFloat(position['unrealized_pnl']) > 0 ? 'green' : 'red';

                // sl_type
                position['sl_type'] = position['amount'].substring(0, 1) === '-' ? 'Short' : 'Long';

                // leverage
                position['leverage'] = position['leverage'] ? String(position['leverage'])+'x' : '';

                let ticker = position['instrument_name'].split('-')[0].toLowerCase();
                position['icon_src'] = 'https://www.derive.xyz/_next/image?url=%2Fimages%2Ftokens%2F'+ ticker +'.png&w=64&q=75'

                //$('.portfolio-rows').append(tmpl('portfolio-row', position));
                html += tmpl('portfolio-row', position);
            }
        }

        $('.portfolio-rows').html(html);

        // restore checked positions
        if (_checkedPosTmp.length > 0) {
            _checkedPosTmp.forEach(name => {
                $('.portfolio-rows input[name="'+ name +'"]').prop('checked', true);
            });
        }
    };

    this.renderChart = (portfolio) => {
        let positions = getCheckedPositions(portfolio);
        console.log('filtered:', positions);

        $('#optionsChart').html('');

        if (!positions || positions.length <= 0) {
            return false;
        }

        let tickerPrice = parseInt(positions[0]['index_price']);

        // chart price limits
        // TODO add html inputs to manual adjust size
        let limits = [700, 1000];
        if (tickerPrice > 10000) {
            limits = [5000, 20000];
        } if (tickerPrice < 10) {
            limits = [tickerPrice, 10];
        } else if (tickerPrice < 100) {
            limits = [50, 50];
        } else if (tickerPrice < 1000) {
            limits = [300, 300];
        }

        if (tickerPrice - limits[0] < 0) {
            limits[0] = tickerPrice;
        }

        const prices = Array.from({length: limits[0] + limits[1] +1}, (_, i) => tickerPrice-limits[0] + i);

        let totalPayoff = Array(prices.length).fill(0);

        for (let position of positions) {
            let amount = parseFloat(position['amount']);
            let instrumentType = position['instrument_type'];

            let payoff = Array(prices.length).fill(0);

            if (instrumentType === 'option') {
                let strike = parseInt(position['instrument_name'].split('-')[2]) || 0;
                let isCall = position['instrument_name'].split('-')[3] === 'C';

                let premium = parseFloat(position['average_price']) || 0;

                for (let i = 0; i < prices.length; i++) {
                    let intrinsicValue = isCall
                        ? Math.max(prices[i] - strike, 0)
                        : Math.max(strike - prices[i], 0);

                    payoff[i] = (amount > 0 ? 1 : -1) * (intrinsicValue - premium) * Math.abs(amount);
                }
            }

            if (instrumentType === 'perp') {
                for (let i = 0; i < prices.length; i++) {
                    payoff[i] = (prices[i] - parseFloat(position['average_price'])) * amount;
                }
            }

            // Sum individual position payoff into totalPayoff
            totalPayoff = totalPayoff.map((val, i) => val + payoff[i]);
        }

        Plotly.newPlot('optionsChart', [{
            x: prices,
            y: totalPayoff,
            mode: 'lines',
            name: 'Total PnL',
            line: { color: 'red', width: 2 }
        }], {
            title: 'PnL (Selected Positions)',
            xaxis: { title: 'Underlying Asset Price ($)' },
            yaxis: { title: 'Profit/Loss ($)' },
            shapes: [
                {
                    type: 'line',
                    x0: prices[0], x1: prices[prices.length - 1],
                    y0: 0, y1: 0,
                    line: { color: 'black', width: 1, dash: 'dash' }
                },
                {
                    type: 'line',
                    x0: tickerPrice, x1: tickerPrice,
                    y0: Math.min(...totalPayoff), y1: Math.max(...totalPayoff),
                    line: { color: 'grey', width: 2, dash: 'dot' }
                }
            ]
        });
    };


    let getCheckedPositions = (portfolio) => {
        let positions = [];
        for (let subacc of portfolio) {
            for (let position of subacc.positions) {
                if ($('.portfolio-rows input[name="'+ position['instrument_name'] +'"]:checked').length > 0) {
                    positions.push(position);
                }
            }
        }
        return positions;
    };
};

document.addEventListener('DOMContentLoaded', async function() {

    let dashboard = new Dashboard(jQuery);
    await dashboard.init();

});
