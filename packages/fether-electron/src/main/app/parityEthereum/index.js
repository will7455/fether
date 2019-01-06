// Copyright 2015-2018 Parity Technologies (UK) Ltd.
// This file is part of Parity.
//
// SPDX-License-Identifier: BSD-3-Clause

import {
  getParityPath,
  fetchParity,
  isParityRunning,
  runParity
} from '@parity/electron';
import getRemainingArgs from 'commander-remaining-args';

import { parity } from '../../../../package.json';
import handleError from '../../utils/handleError';
import cli from '../../cli';
import Pino from '../../utils/pino';

const pino = Pino();

let hasCalledInitParityEthereum = false;

class ParityEthereum {
  setup = fetherAppWindow => {
    if (hasCalledInitParityEthereum) {
      throw new Error('Unable to initialise Parity Ethereum more than once');
    }

    // Check if Parity Ethereum is installed
    getParityPath()
      // Download and install Parity Ethereum if not present
      .catch(() => {
        pino.info('Downloading and Installing Parity Ethereum');
        return this.install(fetherAppWindow);
      })
      .then(async () => {
        // Do not run Parity Ethereum if the user ran Fether with --no-run-parity
        if (!cli.runParity) {
          return;
        }

        // Do not run Parity Ethereum if it is already running
        if (await this.isRunning()) {
          return;
        }

        // Run Parity Ethereum when installed
        const parityEthereum = await this.run();
        pino.info('Running Parity Ethereum');
        return parityEthereum;
      })
      .then(() => {
        // Notify the renderers
        fetherAppWindow.webContents.send('parity-running', true);
        global.isParityRunning = true; // Send this variable to renderers via IPC
      })
      .catch(handleError);
  };

  install = fetherAppWindow => {
    return fetchParity(fetherAppWindow, {
      onProgress: progress => {
        // Notify the renderers on download progress
        return fetherAppWindow.webContents.send(
          'parity-download-progress',
          progress
        );
      },
      parityChannel: parity.channel
    });
  };

  isRunning = async () => {
    return isParityRunning({
      wsInterface: cli.wsInterface,
      wsPort: cli.wsPort
    });
  };

  run = async () => {
    return runParity({
      flags: [
        ...getRemainingArgs(cli),
        '--light',
        '--chain',
        cli.chain,
        '--ws-interface',
        cli.wsInterface,
        '--ws-port',
        cli.wsPort
      ],
      onParityError: err =>
        handleError(err, 'An error occured with Parity Ethereum.')
    });
  };
}

export default ParityEthereum;
