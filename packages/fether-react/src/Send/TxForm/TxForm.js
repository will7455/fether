// Copyright 2015-2018 Parity Technologies (UK) Ltd.
// This file is part of Parity.
//
// SPDX-License-Identifier: BSD-3-Clause

import React, { Component } from 'react';
import BigNumber from 'bignumber.js';
import { Clickable, Form as FetherForm, Header } from 'fether-ui';
import createDecorator from 'final-form-calculate';
import { chainId$, withoutLoading } from '@parity/light.js';
import debounce from 'debounce-promise';
import { Field, Form } from 'react-final-form';
import { fromWei, toWei } from '@parity/api/lib/util/wei';
import { inject, observer } from 'mobx-react';
import { isAddress } from '@parity/api/lib/util/address';
import light from '@parity/light.js-react';
import { Link } from 'react-router-dom';
import { OnChange } from 'react-final-form-listeners';
import { withProps } from 'recompose';

import { estimateGas } from '../../utils/transaction';
import RequireHealth from '../../RequireHealthOverlay';
import TokenBalance from '../../Tokens/TokensList/TokenBalance';
import TxDetails from './TxDetails';
import withAccount from '../../utils/withAccount';
import withBalance, { withEthBalance } from '../../utils/withBalance';
import withTokens from '../../utils/withTokens';

const DEFAULT_AMOUNT_MAX_CHARS = 9;
const MEDIUM_AMOUNT_MAX_CHARS = 14;
const MAX_GAS_PRICE = 40; // In Gwei
const MIN_GAS_PRICE = 3; // Safelow gas price from GasStation, in Gwei

@inject('parityStore', 'sendStore')
@withTokens
@withProps(({ match: { params: { tokenAddress } }, tokens }) => ({
  token: tokens[tokenAddress]
}))
@withAccount
@light({
  chainId: () => chainId$().pipe(withoutLoading())
})
@withBalance // Balance of current token (can be ETH)
@withEthBalance // ETH balance
@observer
class TxForm extends Component {
  state = {
    maxSelected: false,
    showDetails: false
  };

  decorator = createDecorator({
    field: /to|amount/, // when the value of these fields change...
    updates: {
      // ...set field "gas"
      gas: async (value, allValues) => {
        const { parityStore, token } = this.props;
        let newGasEstimate = null;

        if (this.preValidate(allValues) === true) {
          try {
            newGasEstimate = await estimateGas(
              allValues,
              token,
              parityStore.api
            );
          } catch (error) {
            console.error(error);
            return new BigNumber(-1);
          }
        }

        return newGasEstimate;
      }
    }
  });

  changeAmountFontSize = amount => {
    const amountLen = amount.toString().length;
    if (amountLen > MEDIUM_AMOUNT_MAX_CHARS) {
      return '-resize-font-small'; // Resize to fit an amount as small as one Wei
    } else if (
      MEDIUM_AMOUNT_MAX_CHARS >= amountLen &&
      amountLen > DEFAULT_AMOUNT_MAX_CHARS
    ) {
      return '-resize-font-medium';
    }
    return '-resize-font-default';
  };

  calculateMax = (gas, gasPrice) => {
    const { token, balance } = this.props;
    const gasBn = gas ? new BigNumber(gas) : new BigNumber(21000);
    const gasPriceBn = new BigNumber(gasPrice);
    let output;

    if (token.address === 'ETH') {
      output = fromWei(
        toWei(balance).minus(gasBn.multipliedBy(toWei(gasPriceBn, 'shannon')))
      );
      output = output.isNegative() ? new BigNumber(0) : output;
    } else {
      output = balance;
    }
    return output;
  };

  isEstimatedTxFee = values => {
    if (
      values.amount &&
      values.gas &&
      values.gasPrice &&
      !isNaN(values.amount) &&
      !values.gas.isNaN() &&
      !isNaN(values.gasPrice)
    ) {
      return true;
    }

    return false;
  };

  estimatedTxFee = values => {
    if (!this.isEstimatedTxFee(values)) {
      return null;
    }

    return values.gas.multipliedBy(toWei(values.gasPrice, 'shannon'));
  };

  handleSubmit = values => {
    const {
      account: { address, type, transactionCount },
      chainId,
      history,
      sendStore,
      token
    } = this.props;

    sendStore.setTx({ ...values, chainId, token, transactionCount });

    if (type === 'signer') {
      history.push(`/send/${token.address}/from/${address}/txqrcode`);
    } else {
      history.push(`/send/${token.address}/from/${address}/unlock`);
    }
  };

  recalculateMax = (args, state, { changeValue }) => {
    changeValue(state, 'amount', value => {
      return this.calculateMax(
        state.formState.values.gas,
        state.formState.values.gasPrice
      );
    });
  };

  toggleMax = () => {
    this.setState({ maxSelected: !this.state.maxSelected });
  };

  showDetailsAnchor = () => {
    return (
      <span className='toggle-details'>
        <Clickable onClick={this.toggleDetails}>&darr; Details</Clickable>
      </span>
    );
  };

  showHideAnchor = () => {
    return (
      <span className='toggle-details'>
        <Clickable onClick={this.toggleDetails}>&uarr; Hide</Clickable>
      </span>
    );
  };

  toggleDetails = () => {
    const { showDetails } = this.state;

    this.setState({ showDetails: !showDetails });
  };

  render () {
    const {
      account: { address, type },
      sendStore: { tx },
      token
    } = this.props;

    const { showDetails } = this.state;

    return (
      <div>
        <Header
          left={
            <Link to={`/tokens/${address}`} className='icon -back'>
              Close
            </Link>
          }
          title={token && <h1>Send {token.name}</h1>}
        />

        <RequireHealth require='sync'>
          <div className='window_content'>
            <div className='box -padded'>
              <TokenBalance
                decimals={6}
                drawers={[
                  <Form
                    key='txForm'
                    initialValues={{ from: address, gasPrice: 4, ...tx }}
                    onSubmit={this.handleSubmit}
                    validate={this.validateForm}
                    decorators={[this.decorator]}
                    mutators={{ recalculateMax: this.recalculateMax }}
                    render={({
                      handleSubmit,
                      valid,
                      validating,
                      values,
                      form: { mutators }
                    }) => (
                      <form className='send-form' onSubmit={handleSubmit}>
                        <fieldset className='form_fields'>
                          <Field
                            as='textarea'
                            autoFocus
                            className='-sm'
                            label='To'
                            name='to'
                            placeholder='0x...'
                            required
                            render={FetherForm.Field}
                          />

                          <Field
                            className={`form_field_amount ${
                              !values.amount
                                ? '-resize-font-default'
                                : this.changeAmountFontSize(values.amount)
                            }`}
                            disabled={this.state.maxSelected}
                            formNoValidate
                            label='Amount'
                            name='amount'
                            placeholder='0.00'
                            render={FetherForm.Field}
                            required
                            type='number'
                          >
                            <button
                              type='button'
                              className={
                                this.state.maxSelected
                                  ? 'button -tiny active max'
                                  : 'button -tiny max'
                              }
                              onClick={() => {
                                this.toggleMax();
                                mutators.recalculateMax();
                              }}
                            >
                              Max
                            </button>
                          </Field>

                          <Field
                            centerText={`${values.gasPrice} GWEI`}
                            className='-range'
                            label='Transaction Speed'
                            leftText='Low'
                            max={MAX_GAS_PRICE}
                            min={MIN_GAS_PRICE}
                            name='gasPrice'
                            render={FetherForm.Slider}
                            required
                            rightText='High'
                            step={0.5}
                            type='range' // In Gwei
                          />

                          <TxDetails
                            estimatedTxFee={this.estimatedTxFee(values)}
                            showDetails={showDetails}
                            token={token}
                            values={values}
                          />

                          <OnChange name='gasPrice'>
                            {(value, previous) => {
                              if (this.state.maxSelected) {
                                mutators.recalculateMax();
                              }
                            }}
                          </OnChange>

                          {values.to === values.from && (
                            <span>
                              <h3>WARNING:</h3>
                              <p>
                                The sender and receiver addresses are the same.
                              </p>
                            </span>
                          )}
                        </fieldset>
                        <nav className='form-nav'>
                          <div className='form-details-buttons'>
                            {showDetails
                              ? this.showHideAnchor()
                              : this.showDetailsAnchor()}
                          </div>
                          <button
                            disabled={!valid || validating}
                            className='button'
                          >
                            {validating
                              ? 'Checking...'
                              : type === 'signer'
                                ? 'Scan'
                                : 'Send'}
                          </button>
                        </nav>
                      </form>
                    )}
                  />
                ]}
                onClick={null} // To disable cursor:pointer on card // TODO Can this be done better?
                token={token}
              />
            </div>
          </div>
        </RequireHealth>
      </div>
    );
  }

  preValidate = values => {
    const { balance, token } = this.props;

    if (!values) {
      return;
    }

    if (!values.amount) {
      return { amount: 'Please enter a valid amount' };
    }

    const amountBn = new BigNumber(values.amount.toString());

    if (amountBn.isNaN()) {
      return { amount: 'Please enter a valid amount' };
    } else if (amountBn.isZero()) {
      if (this.state.maxSelected) {
        return { amount: 'ETH balance too low to pay for gas.' };
      }
      return { amount: 'Please enter a non-zero amount' };
    } else if (amountBn.isNegative()) {
      return { amount: 'Please enter a positive amount' };
    } else if (token.address === 'ETH' && toWei(values.amount).lt(1)) {
      return { amount: 'Please enter at least 1 Wei' };
    } else if (amountBn.dp() > token.decimals) {
      return {
        amount: `Please enter a ${token.name} value of less than ${
          token.decimals
        } decimal places`
      };
    } else if (balance && balance.lt(amountBn)) {
      return { amount: `You don't have enough ${token.symbol} balance` };
    } else if (!values.to || !isAddress(values.to)) {
      return { to: 'Please enter a valid Ethereum address' };
    } else if (values.to === '0x0000000000000000000000000000000000000000') {
      return {
        to: `You are not permitted to send ${
          token.name
        } to the zero account (0x0)`
      };
    }
    return true;
  };

  /**
   * Estimate gas amount, and validate that the user has enough balance to make
   * the tx.
   */
  validateForm = debounce(values => {
    if (!values) {
      return;
    }

    try {
      const { ethBalance, token } = this.props;

      if (!ethBalance) {
        throw new Error('No "ethBalance"');
      }

      const preValidation = this.preValidate(values);

      // preValidate return an error if a field isn't valid
      if (preValidation !== true) {
        return preValidation;
      }

      if (values.gas && values.gas.eq(-1)) {
        return { amount: 'Unable to estimate gas...' };
      }

      // If the gas hasn't been calculated yet, then we don't show any errors,
      // just wait a bit more
      if (!this.isEstimatedTxFee(values)) {
        return { amount: 'Estimating gas...' };
      }

      // Verify that `gas + (eth amount if sending eth) <= ethBalance`
      if (
        this.estimatedTxFee(values)
          .plus(token.address === 'ETH' ? toWei(values.amount) : 0)
          .gt(toWei(ethBalance))
      ) {
        return token.address !== 'ETH'
          ? { amount: 'ETH balance too low to pay for gas' }
          : { amount: "You don't have enough ETH balance" };
      }
    } catch (err) {
      console.error(err);
      return {
        amount: 'Failed estimating balance, please try again'
      };
    }
  }, 1000);
}

export default TxForm;
