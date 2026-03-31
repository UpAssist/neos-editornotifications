<?php

declare(strict_types=1);

namespace UpAssist\Neos\EditorNotifications\Domain\Repository;

use Neos\Flow\Annotations as Flow;
use Neos\Flow\Persistence\Repository;
use Neos\Neos\Domain\Model\User;
use UpAssist\Neos\EditorNotifications\Domain\Model\Notification;
use UpAssist\Neos\EditorNotifications\Domain\Model\NotificationReadState;

/**
 * @Flow\Scope("singleton")
 */
class NotificationReadStateRepository extends Repository
{
    public function findOneByNotificationAndUser(Notification $notification, User $user): ?NotificationReadState
    {
        $query = $this->createQuery();
        $query->matching(
            $query->logicalAnd(
                $query->equals('notification', $notification),
                $query->equals('user', $user)
            )
        );

        return $query->execute()->getFirst();
    }
}
