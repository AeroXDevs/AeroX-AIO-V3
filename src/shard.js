import { ClusterManager, HeartbeatManager } from 'discord-hybrid-sharding';

import { config } from '#config/config';
import { logger } from '#utils/logger';
import './healthcheck.js';

// FIX: totalShards and shardsPerCluster now read from config (which reads from env vars)
// Set TOTAL_SHARDS=auto or TOTAL_SHARDS=4 in your .env file.
// Set SHARDS_PER_CLUSTER=2 (default) to control cluster density.
const manager = new ClusterManager('./src/index.js', {
  totalShards: config.sharding.totalShards,
  shardsPerCluster: config.sharding.shardsPerCluster,
  mode: 'process',
  token: config.token,
  respawn: true,
  restartMode: 'gracefulSwitch',
});

manager.extend(
  new HeartbeatManager({
    interval: 2000,
    maxMissedHeartbeats: 5,
  }),
);

manager.on('clusterCreate', cluster => {
  logger.info('ClusterManager', ` ==> Launched Cluster ${cluster.id} [${cluster.shardList.join(', ')}]`);
  cluster.on('clientReady', () =>
    logger.success('ClusterManager', `Cluster ${cluster.id} ==> Ready`),
  );
  cluster.on('reconnecting', () =>
    logger.warn('ClusterManager', `Cluster ${cluster.id} ==> Reconnecting...`),
  );
  cluster.on('death', (p, code) =>
    logger.error('ClusterManager', `Cluster ${cluster.id} ==> Died with exit code ${code}. Respawning...`),
  );
  cluster.on('error', e =>
    logger.error('ClusterManager', `Cluster ${cluster.id} ==> An error occurred:`, e),
  );
});

manager.on('debug', msg => {
  if (!msg.includes('Heartbeat')) {
    logger.debug('ClusterManager', msg);
  }
});

const shutdown = () => {
  logger.info('ClusterManager', ' ==> Shutting down all clusters...');
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

manager
  .spawn({ timeout: -1 })
  .then(() =>
    logger.success('ClusterManager', ' ==> All clusters are loaded and bot is ready! 🚀'),
  )
  .catch(error =>
    logger.error('ClusterManager', ' ==> Error during spawn:', error),
  );
