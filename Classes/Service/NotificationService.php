<?php

declare(strict_types=1);

namespace UpAssist\Neos\EditorNotifications\Service;

use League\CommonMark\CommonMarkConverter;
use Neos\Flow\Annotations as Flow;
use Neos\Flow\Persistence\PersistenceManagerInterface;
use Neos\Neos\Domain\Model\User;
use Neos\Neos\Domain\Service\UserService;
use UpAssist\Neos\EditorNotifications\Domain\Model\Notification;
use UpAssist\Neos\EditorNotifications\Domain\Model\NotificationReadState;
use UpAssist\Neos\EditorNotifications\Domain\Repository\NotificationReadStateRepository;
use UpAssist\Neos\EditorNotifications\Domain\Repository\NotificationRepository;

/**
 * @Flow\Scope("singleton")
 */
class NotificationService
{
    /**
     * @Flow\Inject
     * @var NotificationRepository
     */
    protected $notificationRepository;

    /**
     * @Flow\Inject
     * @var NotificationReadStateRepository
     */
    protected $notificationReadStateRepository;

    /**
     * @Flow\Inject
     * @var UserService
     */
    protected $userService;

    /**
     * @Flow\Inject
     * @var PersistenceManagerInterface
     */
    protected $persistenceManager;

    /**
     * @return array{notification: Notification, errors: array<int, string>}
     */
    public function createNotification(string $title, string $content, ?\DateTime $showFrom = null, ?\DateTime $showUntil = null): array
    {
        $notification = new Notification();
        return $this->updateNotification($notification, $title, $content, $showFrom, $showUntil, true);
    }

    /**
     * @return array{notification: Notification, errors: array<int, string>}
     */
    public function updateNotification(Notification $notification, string $title, string $content, ?\DateTime $showFrom = null, ?\DateTime $showUntil = null, bool $isNew = false): array
    {
        $errors = $this->validateInput($title, $showFrom, $showUntil);

        if ($errors !== []) {
            return [
                'notification' => $notification,
                'errors' => $errors,
            ];
        }

        $notification->setTitle($title);
        $notification->setContentMarkdown($content);
        $notification->setContent($this->renderMarkdown($content));
        $notification->setShowFrom($showFrom);
        $notification->setShowUntil($showUntil);

        if ($isNew) {
            $notification->setCreatedBy($this->getCurrentUser());
            $this->notificationRepository->add($notification);
        } else {
            $this->notificationRepository->update($notification);
        }

        return [
            'notification' => $notification,
            'errors' => $errors,
        ];
    }

    public function publish(Notification $notification): void
    {
        $notification->setPublishedAt(new \DateTime());
        $notification->setArchivedAt(null);
        $this->notificationRepository->update($notification);
    }

    public function unpublish(Notification $notification): void
    {
        $notification->setPublishedAt(null);
        $this->notificationRepository->update($notification);
    }

    public function archive(Notification $notification): void
    {
        $notification->setArchivedAt(new \DateTime());
        $this->notificationRepository->update($notification);
    }

    public function delete(Notification $notification): void
    {
        $this->notificationRepository->remove($notification);
    }

    /**
     * @return array{count: int, items: array<int, array<string, mixed>>}
     */
    public function getActiveNotificationsForCurrentUser(bool $includeDismissed = false): array
    {
        $user = $this->getCurrentUser();
        if ($user === null) {
            return ['count' => 0, 'items' => []];
        }

        $notifications = $this->notificationRepository->findActive();
        $items = [];
        $unreadCount = 0;

        foreach ($notifications as $notification) {
            $state = $this->notificationReadStateRepository->findOneByNotificationAndUser($notification, $user);
            $isSeen = $state !== null && $state->getSeenAt() !== null;
            $isDismissed = $state !== null && $state->getDismissedAt() !== null;

            if (!$isSeen) {
                $unreadCount++;
            }

            if ($isDismissed && !$includeDismissed) {
                continue;
            }

            $items[] = [
                'identifier' => $this->persistenceManager->getIdentifierByObject($notification),
                'title' => $notification->getTitle(),
                'content' => $notification->getContent(),
                'publishedAt' => $notification->getPublishedAt()?->format(\DateTimeInterface::ATOM),
                'showFrom' => $notification->getShowFrom()?->format(\DateTimeInterface::ATOM),
                'showUntil' => $notification->getShowUntil()?->format(\DateTimeInterface::ATOM),
                'isSeen' => $isSeen,
                'isDismissed' => $isDismissed,
            ];
        }

        usort($items, static function (array $left, array $right): int {
            return strcmp((string)($right['publishedAt'] ?? ''), (string)($left['publishedAt'] ?? ''));
        });

        return [
            'count' => $unreadCount,
            'items' => $items,
        ];
    }

    public function markSeen(Notification $notification): void
    {
        $user = $this->getCurrentUser();
        if ($user === null) {
            return;
        }

        $state = $this->findOrCreateReadState($notification, $user);
        if ($state->getSeenAt() === null) {
            $state->setSeenAt(new \DateTime());
        }
        $this->persistReadState($state);
    }

    public function markUnseen(Notification $notification): void
    {
        $user = $this->getCurrentUser();
        if ($user === null) {
            return;
        }

        $state = $this->notificationReadStateRepository->findOneByNotificationAndUser($notification, $user);
        if ($state === null) {
            return;
        }

        $state->setSeenAt(null);
        $state->setDismissedAt(null);
        $this->persistReadState($state);
    }

    public function dismiss(Notification $notification): void
    {
        $user = $this->getCurrentUser();
        if ($user === null) {
            return;
        }

        $state = $this->findOrCreateReadState($notification, $user);
        if ($state->getSeenAt() === null) {
            $state->setSeenAt(new \DateTime());
        }
        if ($state->getDismissedAt() === null) {
            $state->setDismissedAt(new \DateTime());
        }
        $this->persistReadState($state);
    }

    /**
     * @return array<int, string>
     */
    private function validateInput(string $title, ?\DateTime $showFrom, ?\DateTime $showUntil): array
    {
        $errors = [];

        if (trim($title) === '') {
            $errors[] = 'Titel is verplicht.';
        }

        if ($showFrom !== null && $showUntil !== null && $showUntil < $showFrom) {
            $errors[] = 'Toon tot moet later zijn dan toon vanaf.';
        }

        return $errors;
    }

    private function renderMarkdown(string $markdown): string
    {
        $markdown = trim($markdown);
        if ($markdown === '') {
            return '';
        }

        $converter = new CommonMarkConverter([
            'html_input' => 'strip',
            'allow_unsafe_links' => false,
        ]);

        return trim($converter->convert($markdown)->getContent());
    }

    private function findOrCreateReadState(Notification $notification, User $user): NotificationReadState
    {
        $state = $this->notificationReadStateRepository->findOneByNotificationAndUser($notification, $user);
        if ($state instanceof NotificationReadState) {
            return $state;
        }

        return new NotificationReadState($notification, $user);
    }

    private function persistReadState(NotificationReadState $state): void
    {
        if ($this->persistenceManager->isNewObject($state)) {
            $this->notificationReadStateRepository->add($state);
            return;
        }

        $this->notificationReadStateRepository->update($state);
    }

    private function getCurrentUser(): ?User
    {
        $user = $this->userService->getCurrentUser();
        return $user instanceof User ? $user : null;
    }
}
