<?php

declare(strict_types=1);

namespace UpAssist\Neos\EditorNotifications\Domain\Model;

use Doctrine\ORM\Mapping as ORM;
use Neos\Flow\Annotations as Flow;
use Neos\Neos\Domain\Model\User;

/**
 * @Flow\Entity
 * @ORM\Table(
 *     name="upassist_neos_editornotifications_notificationreadstate",
 *     uniqueConstraints={
 *         @ORM\UniqueConstraint(name="notification_user_unique", columns={"notification", "user"})
 *     }
 * )
 */
class NotificationReadState
{
    /**
     * @var Notification
     * @ORM\ManyToOne
     */
    protected Notification $notification;

    /**
     * @var User
     * @ORM\ManyToOne
     */
    protected User $user;

    /**
     * @var \DateTime|null
     * @ORM\Column(nullable=true)
     */
    protected ?\DateTime $seenAt = null;

    /**
     * @var \DateTime|null
     * @ORM\Column(nullable=true)
     */
    protected ?\DateTime $dismissedAt = null;

    /**
     * @var \DateTime|null
     * @ORM\Column(nullable=true)
     */
    protected ?\DateTime $removedAt = null;

    public function __construct(Notification $notification, User $user)
    {
        $this->notification = $notification;
        $this->user = $user;
    }

    public function getNotification(): Notification
    {
        return $this->notification;
    }

    public function getUser(): User
    {
        return $this->user;
    }

    public function getSeenAt(): ?\DateTime
    {
        return $this->seenAt;
    }

    public function setSeenAt(?\DateTime $seenAt): void
    {
        $this->seenAt = $seenAt;
    }

    public function getDismissedAt(): ?\DateTime
    {
        return $this->dismissedAt;
    }

    public function setDismissedAt(?\DateTime $dismissedAt): void
    {
        $this->dismissedAt = $dismissedAt;
    }

    public function getRemovedAt(): ?\DateTime
    {
        return $this->removedAt;
    }

    public function setRemovedAt(?\DateTime $removedAt): void
    {
        $this->removedAt = $removedAt;
    }
}
